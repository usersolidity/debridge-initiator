require("dotenv-flow").config();
const express = require("express");
const bodyParser = require("body-parser");
const request = require("request");
const app = express();
const Web3 = require("web3");
const { Pool } = require("pg");
const whiteDebridgeAbi = require("./assets/WhiteDebridge.json").abi;

const chainConfigDatabase = process.env.CHAIN_CONFIG_DATABASE;
const supportedChainsDatabase = process.env.SUPPORTED_CHAINS_DATABASE;
const submissionsDatabase = process.env.SUBMISSIONS_DATABASE;
const minConfirmations = process.env.MIN_CONFIRMATIONS;

const pool = new Pool();
let pgClient;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const chainConfigs = require("./assets/ChainConfig.json");

app.get("/", function (req, res) {
  res.sendStatus(200);
});

app.post("/jobs", function (req, res) {
  res.sendStatus(200);
});

/* call the chainlink node and run a job */
async function subscribe() {
  const supportedChains = await getSupportedChains();
  console.log(supportedChains);
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
      await processNewTransfers(events);
    }
  );
  registerInstance.getPastEvents(
    "Burnt",
    { fromBlock, toBlock },
    async (error, events) => {
      await processNewTransfers(events);
    }
  );

  // /* update lattest viewed block */
  supportedChain.latestblock = toBlock;
  await updateSupportedChainBlock(supportedChain.chainid, toBlock);
}

/* proccess new events */
async function processNewTransfers(events, chainConfig) {
  console.log(events);
  for (let e of events) {
    /* remove chainIdTo function selector */
    const chainIdTo = e.returnValues.chainIdTo;
    const chainConfig = await getChainConfig(chainIdTo);
    if (!chainConfig) continue;

    /* call chainlink node */
    if (e.event === "Sent") {
      callChainlinkNode(
        chainConfig.mintjobid,
        chainConfig,
        e.returnValues.sentId
      );
    } else {
      callChainlinkNode(
        chainConfig.burntjobid,
        chainConfig,
        e.returnValues.burntId
      );
    }
  }
}

/* call the chainlink node and run a job */
function callChainlinkNode(jobId, chainConfig, data) {
  const url_addon = "/v2/specs/" + jobId + "/runs";
  request.post(
    {
      headers: {
        "content-type": "application/json",
        "X-Chainlink-EA-AccessKey": chainConfig.eiicaccesskey,
        "X-Chainlink-EA-Secret": chainConfig.eiicsecret,
      },
      url: chainConfig.eichainlinkurl + url_addon,
      body: `{"result" : "${data}"}`,
    },
    console.log
  );
}

async function connectDb() {
  pgClient = await pool.connect();
}

/* */
async function createTables() {
  // await pgClient.query(`drop table if exists ${submissionsDatabase} ;`);
  // await pgClient.query(`drop table if exists ${supportedChainsDatabase} ;`);
  // await pgClient.query(`drop table if exists ${chainConfigDatabase} ;`);
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
    submissioId             integer primary key,
    txHash                  char(64),
    chainFrom               integer,
    chainTo                 integer,
    debridgeId              char(64),
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
    60000
  );
  await createSupportedChain(
    42,
    0,
    "eth",
    "https://kovan.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161",
    "0x9d088A627bb3110e4Cf66690F31A02a48B809387",
    60000
  );
  await createChainConfig(
    42,
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
  submissioId,
  txHash,
  chainFrom,
  chainTo,
  debridgeId,
  receiverAddr,
  amount,
  status,
  chainFrom,
  chainTo
) {
  await pgClient.query(`insert into ${submissionsDatabase} (
    submissioId,
    txHash,
    chainFrom,
    chainTo,
    debridgeId,
    receiverAddr,
    amount,
    status,
    chainFrom,
    chainTo
  ) values(
    '${submissioId}',
    '${txHash}',
    ${chainFrom},
    ${chainTo},
    '${debridgeId}',
    '${receiverAddr}',
    ${amount},
    ${status},
    ${chainFrom},
    ${chainTo}
  ) on conflict do nothing;`);
}
async function getChainConfigs() {
  const result = await pgClient.query(`select * from ${chainConfigDatabase};`);
  return result.rows;
}
async function getChainConfig(chainId) {
  const result = await pgClient.query(
    `select * from ${chainConfigDatabase} where chainId=${chainId};`
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}
async function getSupportedChains() {
  const result = await pgClient.query(
    `select * from ${supportedChainsDatabase};`
  );
  return result.rows;
}
async function getSubmission(submissionId) {
  const result = await pgClient.query(`select * from ${submissionsDatabase};`);
  return result.rows;
}
async function updateSupportedChainBlock(chainId, latestBlock) {
  await pgClient.query(`update ${supportedChainsDatabase} set 
  latestBlock = ${latestBlock}
  where chainId = ${chainId};`);
}
async function updateSubmissionStatus(submissionId, status) {
  await pgClient.query(`update ${submissionsDatabase} set 
  status = ${status}
  where submissionId = ${submissionId};`);
}

/* TODO: add logger */
const server = app.listen(process.env.PORT || 8080, async function () {
  const port = server.address().port;
  console.log("App now running on port", port);
  await connectDb();
  await createTables();
  await subscribe();
});
