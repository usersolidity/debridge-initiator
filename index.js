require("dotenv-flow").config();
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const app = express();
const Web3 = require("web3");
const { Pool } = require("pg");
const whiteDebridgeAbi = require("./assets/WhiteDebridge.json").abi;

const chainConfigDatabase = process.env.CHAIN_CONFIG_DATABASE;
const supportedChainsDatabase = process.env.SUPPORTED_CHAINS_DATABASE;
const submissionsDatabase = process.env.SUBMISSIONS_DATABASE;
const minConfirmations = process.env.MIN_CONFIRMATIONS;
const emailAddress = process.env.EMAIL_ADDRESS;
const password = process.env.PASSWORD;

const pool = new Pool();
let pgClient;

const SubmisionStatus = {
  CREATED: 0,
  BROADCASTED: 1,
  CONFIRMED: 2,
  REVERTED: 3,
};

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.get("/", function (req, res) {
  res.sendStatus(200);
});

app.post("/jobs", function (req, res) {
  res.sendStatus(200);
});

/* call the chainlink node and run a job */
async function subscribe() {
  const supportedChains = await getSupportedChains();
  for (let supportedChain of supportedChains) {
    const web3 = new Web3(supportedChain.provider);
    const registerInstance = new web3.eth.Contract(
      whiteDebridgeAbi,
      supportedChain.debridgeaddr
    );

    setInterval(() => {
      checkNewEvents(supportedChain, web3, registerInstance);
    }, supportedChain.interval);
  }
  const chainConfigs = await getChainConfigs();
  for (let chainConfig of chainConfigs) {
    setInterval(() => {
      checkConfirmations(chainConfig);
    }, 10000);
  }
  setInterval(() => {
    updateTrxStatus();
  }, 120000);
}

/* collect new events */
async function checkNewEvents(supportedChain, web3, registerInstance) {
  /* get blocks range */
  const toBlock = (await web3.eth.getBlockNumber()) - minConfirmations;
  const fromBlock = supportedChain.latestblock;
  if (fromBlock >= toBlock) return;

  /* get events */
  registerInstance.getPastEvents(
    "Sent",
    { fromBlock, toBlock },
    async (error, events) => {
      await processNewTransfers(events, supportedChain.chainid);
    }
  );
  registerInstance.getPastEvents(
    "Burnt",
    { fromBlock, toBlock },
    async (error, events) => {
      await processNewTransfers(events, supportedChain.chainid);
    }
  );

  /* update lattest viewed block */
  supportedChain.latestblock = toBlock;
  await updateSupportedChainBlock(supportedChain.chainid, toBlock);
}

/* proccess new events */
async function processNewTransfers(events, chainIdFrom) {
  // console.log(events);
  for (let e of events) {
    /* remove chainIdTo function selector */
    const chainIdTo = e.returnValues.chainIdTo;
    const chainConfig = await getChainConfig(chainIdTo);
    if (!chainConfig) continue;

    /* call chainlink node */
    let submissionId;
    if (e.event == "Sent") {
      submissionId = e.returnValues.sentId;
      const submission = await getSubmission(submissionId);
      if (submission) continue;
      callChainlinkNode(
        chainConfig.mintjobid,
        chainConfig,
        submissionId,
        e.returnValues,
        chainIdFrom
      );
    } else {
      submissionId = e.returnValues.burntId;
      const submission = await getSubmission(submissionId);
      if (submission) continue;
      callChainlinkNode(
        chainConfig.burntjobid,
        chainConfig,
        submissionId,
        e.returnValues,
        chainIdFrom
      );
    }
  }
}

/* set chainlink cookies */
async function checkConfirmations(chainConfig) {
  const createdSubmissions = await getSubmissionsByStatus(
    SubmisionStatus.CREATED
  );
  for (let submission of createdSubmissions) {
    const trxHash = await getChainlinkRun(
      chainConfig.eichainlinkurl,
      submission.runid,
      chainConfig.cookie
    );
    console.log(trxHash);
    if (trxHash)
      await updateSubmissionStatus(
        submission.submissionId,
        SubmisionStatus.BROADCASTED
      );
  }
}

/* set chainlink cookies */
async function setAllChainlinkCookies() {
  const chainConfigs = await getChainConfigs();
  for (const chainConfig of chainConfigs) {
    await setChainlinkCookies(chainConfig.chainid, chainConfig.eichainlinkurl);
  }
}

/* set chainlink cookies */
async function setChainlinkCookies(chainId, eiChainlinkUrl) {
  const sessionUrl = "/sessions";
  const headers = {
    "content-type": "application/json",
  };
  const body = { email: emailAddress, password: password };
  const response = await axios.post(eiChainlinkUrl + sessionUrl, body, {
    headers,
  });
  const cookies = response.headers["set-cookie"];
  await updateChainConfigCokie(chainId, JSON.stringify(cookies));
}

/* set chainlink cookies */
async function getChainlinkRun(eiChainlinkUrl, runId, cookie) {
  const getRunUrl = "/v2/runs/" + runId;
  const headers = {
    "content-type": "application/json",
    Cookie: JSON.parse(cookie),
  };

  try {
    const response = await axios.get(eiChainlinkUrl + getRunUrl, {
      headers,
    });
    // console.log(response);
    const txHash = response.data.data.attributes;
    console.log(JSON.stringify(txHash));
  } catch (e) {}
}

/* post chainlink run */
async function postChainlinkRun(
  jobId,
  data,
  eiChainlinkUrl,
  eiIcAccessKey,
  eiIcSecret
) {
  const postJobUrl = "/v2/specs/" + jobId + "/runs";
  const headers = {
    "content-type": "application/json",
    "X-Chainlink-EA-AccessKey": eiIcAccessKey,
    "X-Chainlink-EA-Secret": eiIcSecret,
  };
  const body = { result: data };

  const response = await axios.post(eiChainlinkUrl + postJobUrl, body, {
    headers,
  });
  return response.data.data.id;
}

/* call the chainlink node and run a job */
async function callChainlinkNode(
  jobId,
  chainConfig,
  submissionId,
  e,
  chainIdFrom
) {
  const runId = await postChainlinkRun(
    jobId,
    submissionId,
    chainConfig.eichainlinkurl,
    chainConfig.eiicaccesskey,
    chainConfig.eiicsecret
  );

  await createSubmission(
    submissionId,
    "NULL",
    runId,
    chainIdFrom,
    e.chainIdTo,
    e.debridgeId,
    e.receiver,
    e.amount,
    SubmisionStatus.CREATED
  );
}

async function updateTrxStatus() {
  const unconfirmedSubmissions = await getSubmissionsByStatus(
    SubmisionStatus.BROADCASTED
  );
  for (let submission of unconfirmedSubmissions) {
    const trx = await web3.eth.getTransactionReceipt(submission.txHash);
    if (trx)
      await updateSubmissionStatus(
        submission.submissionId,
        trx.status ? SubmisionStatus.CONFIRMED : SubmisionStatus.REVERTED
      );
  }
}

async function connectDb() {
  pgClient = await pool.connect();
}

/* */
async function createTables() {
  await pgClient.query(`drop table if exists ${submissionsDatabase} ;`);
  await pgClient.query(`drop table if exists ${supportedChainsDatabase} ;`);
  await pgClient.query(`drop table if exists ${chainConfigDatabase} ;`);
  await pgClient.query(`create table if not exists ${supportedChainsDatabase} (
    chainId                 integer primary key,
    network                 varchar(10),
    debridgeAddr            char(42),
    latestBlock             integer,
    provider                varchar(200),
    interval                integer
  );`);

  await pgClient.query(`create table if not exists ${chainConfigDatabase} (
    chainId                 integer primary key,
    cookie                  varchar(1000),
    eiChainlinkurl          varchar(100),
    eiIcAccesskey           char(32),
    eiIcSecret              char(64),
    eiCiAccesskey           char(64),
    eiCiSecret              char(64),
    mintJobId               char(32),
    burntJobId              char(32),
    network                 varchar(10)
  );`);

  await pgClient.query(`create table if not exists ${submissionsDatabase} (
    submissionId            char(66) primary key,
    txHash                  char(66),
    runId                   varchar(64),
    chainFrom               integer,
    chainTo                 integer,
    debridgeId              char(66),
    receiverAddr            char(42),
    amount                  integer,
    status                  integer,
    constraint chainFrom
      foreign key(chainFrom)
        references ${supportedChainsDatabase}(chainId),
    constraint chainTo
      foreign key(chainTo)
        references ${chainConfigDatabase}(chainId)
  );`);

  await createSupportedChain(
    56,
    0,
    "bsc",
    "ws://46.4.15.216:8546/",
    "0xFAE07FAB51c38aC037b648c304D4dF30681B7399",
    15000
  );
  await createSupportedChain(
    42,
    0,
    "eth",
    "https://kovan.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161",
    "0x9d088A627bb3110e4Cf66690F31A02a48B809387",
    15000
  );
  await createChainConfig(
    42,
    "",
    "http://localhost:6688",
    "a54f872d0f8745b5bb37596ee5ca065a",
    "in2SUAhqiUbcI7SMRuKB1WnDm/VCRWxYIl5MezNf3fB+tnkciu9/4IGuHIMOpfdC",
    "dxdsAL9B4yzNsVh1u6xeyTOnqDWfE3q6jCIPx9Z69BlC7QU8A03A1HnpKHL5Rhq2",
    "4l5HIxQQ4+9Ryp9WyfkuH0yo4jZ27CBAvwIaxUsq9VMP0wV1hQmPMC6B80D0M5uZ",
    "19153723cbfa44e991e8b799c2c96e13",
    "992f49a95e7644feb53fd77cbb9bfbf9",
    "eth"
  );
  await createChainConfig(
    56,
    "",
    "http://localhost:6689",
    "839645c1973d49029eec091590efd3de",
    "cvH6KikuFWvh2Yh2JxWybWYq7r9a9Sgz2TjcB6pDSd/k71aQ9i32GndQYObjbuKP",
    "yS26tEH4kykymlLRytSU/95FvP2DocKvUlcjxdz+kfGpgTZRLV8Rh6Rl74VsmlZ6",
    "e1J4j7zdhZfvxY2xjVWzT+hgD257FThbDjoi1rrpMWVlg3clr1qKfDXcMw/cpwbn",
    "4de92a47796e4ede853ca6268b9b55ff",
    "b1e770e7d5824a15819ee4acedc3a1f3",
    "bsc"
  );
}

async function createChainConfig(
  chainId,
  cookie,
  eiChainlinkurl,
  eiIcAccesskey,
  eiIcSecret,
  eiCiAccesskey,
  eiCiSecret,
  mintJobId,
  burntJobId,
  network
) {
  await pgClient.query(`insert into ${chainConfigDatabase} (
    chainId,
    cookie,
    eiChainlinkurl,
    eiIcAccesskey,
    eiIcSecret,
    eiCiAccesskey,
    eiCiSecret,
    mintJobId,
    burntJobId,
    network
  ) values(
    ${chainId},
    '${cookie}',
    '${eiChainlinkurl}',
    '${eiIcAccesskey}',
    '${eiIcSecret}',
    '${eiCiAccesskey}',
    '${eiCiSecret}',
    '${mintJobId}',
    '${burntJobId}',
    '${network}'
  ) on conflict do nothing;`);
}

async function createSupportedChain(
  chainId,
  latestBlock,
  network,
  provider,
  debridgeAddr,
  interval
) {
  await pgClient.query(`insert into ${supportedChainsDatabase} (
    chainId,
    latestBlock,
    network,
    provider,
    debridgeAddr,
    interval
  ) values(
    ${chainId},
    ${latestBlock},
    '${network}',
    '${provider}',
    '${debridgeAddr}',
    '${interval}'
  ) on conflict do nothing;`);
}

async function createSubmission(
  submissionId,
  txHash,
  runId,
  chainFrom,
  chainTo,
  debridgeId,
  receiverAddr,
  amount,
  status
) {
  await pgClient.query(`insert into ${submissionsDatabase} (
    submissionId,
    txHash,
    runId,
    chainFrom,
    chainTo,
    debridgeId,
    receiverAddr,
    amount,
    status
  ) values(
    '${submissionId}',
    ${txHash},
    '${runId}',
    ${chainFrom},
    ${chainTo},
    '${debridgeId}',
    '${receiverAddr}',
    ${amount},
    ${status}
  ) on conflict do nothing;`);
}

async function getChainConfigs() {
  const result = await pgClient.query(`select * from ${chainConfigDatabase};`);
  return result.rows;
}

async function getChainConfig(chainId) {
  const result = await pgClient.query(
    `select * from ${chainConfigDatabase} where chainId = ${chainId};`
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function getSupportedChains() {
  const result = await pgClient.query(
    `select * from ${supportedChainsDatabase};`
  );
  return result.rows;
}

async function getSubmissionsByStatus(status) {
  const result = await pgClient.query(
    `select * from ${submissionsDatabase} where status = ${status};`
  );
  return result.rows;
}
async function getUnconfirmedSubmission() {
  const result = await pgClient.query(
    `select * from ${submissionsDatabase} where status = 1;`
  );
  return result.rows;
}

async function getSubmission(submissionId) {
  const result = await pgClient.query(`select * from ${submissionsDatabase} 
  where submissionId = '${submissionId}';`);
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function updateSupportedChainBlock(chainId, latestBlock) {
  await pgClient.query(`update ${supportedChainsDatabase} set 
  latestBlock = ${latestBlock}
  where chainId = ${chainId};`);
}

async function updateSubmissionStatus(submissionId, status) {
  await pgClient.query(`update ${submissionsDatabase} set 
  status = ${status}
  where submissionId = '${submissionId}';`);
}

async function updateSubmissionTxHash(submissionId, txHash) {
  await pgClient.query(`update ${submissionsDatabase} set 
  txHash = ${txHash}
  where submissionId = '${submissionId}';`);
}

async function updateChainConfigCokie(chainId, cookie) {
  await pgClient.query(`update ${chainConfigDatabase} set 
  cookie = '${cookie}'
  where chainId = ${chainId};`);
}

/* TODO: add logger */
const server = app.listen(process.env.PORT || 8080, async function () {
  const port = server.address().port;
  console.log("App now running on port", port);
  await connectDb();
  await createTables();
  await setAllChainlinkCookies();
  await subscribe();
});
