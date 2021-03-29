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
  for (let chainConfig of chainConfigs)
    for (let supportedChain of chainConfig.supportedChains)
      setInterval(() => {
        checkNewEvents(chainConfig, supportedChain);
      }, chainConfig.interval);
}

/* collect new events */
async function checkNewEvents(chainConfig, supportedChain) {
  const web3 = new Web3(supportedChain.provider);
  const registerInstance = new web3.eth.Contract(
    whiteDebridgeAbi,
    supportedChain.debridgeAddr
  );

  /* get blocks range */
  const toBlock = (await web3.eth.getBlockNumber()) - 3;
  const fromBlock = supportedChain.latestBlock
    ? supportedChain.latestBlock
    : toBlock - 100;
  if (fromBlock >= toBlock) return;

  /* get events */
  registerInstance.getPastEvents(
    "Sent",
    { fromBlock, toBlock },
    (error, events) => {
      processNewTransfers(events, chainConfig);
    }
  );
  registerInstance.getPastEvents(
    "Burnt",
    { fromBlock, toBlock },
    (error, events) => {
      processNewTransfers(events, chainConfig);
    }
  );

  /* update lattest viewed block */
  supportedChain.latestBlock = toBlock;
}

/* proccess new events */
function processNewTransfers(events, chainConfig) {
  console.log(events);
  for (let e of events) {
    /* remove chainIdTo function selector */
    const chainIdTo = e.returnValues.chainIdTo;
    if (chainIdTo != chainConfig.chainId) continue;

    /* add function selector */
    const jobId =
      e.event === "Sent" ? chainConfig.mintJobId : chainConfig.burntJobId;
    const data =
      e.event === "Sent" ? e.returnValues.sentId : e.returnValues.burntId;

    /* notify oracle node*/
    callChainlinkNode(jobId, chainConfig, data);
  }
}

/* call the chainlink node and run a job */
function callChainlinkNode(jobId, chainConfig, data) {
  const url_addon = "/v2/specs/" + jobId + "/runs";
  request.post(
    {
      headers: {
        "content-type": "application/json",
        "X-Chainlink-EA-AccessKey": chainConfig.eiIcAccesskey,
        "X-Chainlink-EA-Secret": chainConfig.eiIcSecret,
      },
      url: chainConfig.eiChainlinkurl + url_addon,
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
  // {
  //   "eiChainlinkurl": "http://localhost:6688",
  //   "eiIcAccesskey": "a54f872d0f8745b5bb37596ee5ca065a",
  //   "eiIcSecret": "in2SUAhqiUbcI7SMRuKB1WnDm/VCRWxYIl5MezNf3fB+tnkciu9/4IGuHIMOpfdC",
  //   "eiCiAccesskey": "dxdsAL9B4yzNsVh1u6xeyTOnqDWfE3q6jCIPx9Z69BlC7QU8A03A1HnpKHL5Rhq2",
  //   "eiCiSecret": "4l5HIxQQ4+9Ryp9WyfkuH0yo4jZ27CBAvwIaxUsq9VMP0wV1hQmPMC6B80D0M5uZ",
  //   "chainId": 42,
  //   "mintJobId": "19153723cbfa44e991e8b799c2c96e13",
  //   "burntJobId": "992f49a95e7644feb53fd77cbb9bfbf9",
  //   "interval": 30000,
  //   "network": "eth",
  //   "supportedChains": [
  //     {
  //       "latestBlock": 0,
  //       "network": "bsc",
  //       "provider": "ws://46.4.15.216:8546/",
  //       "debridgeAddr": "0xFAE07FAB51c38aC037b648c304D4dF30681B7399"
  //     }
  //   ]
  // }
  await client.query(`CREATE TABLE ${chainConfigDatabase} IF NOT EXISTS (
    chainId                 integer CONSTRAINT firstkey PRIMARY KEY,
    eiChainlinkurl          varchar(100) NOT NULL,
    eiIcAccesskey           char(32) NOT NULL,
    eiIcSecret              char(64) NOT NULL,
    eiCiAccesskey           char(64) NOT NULL,
    eiCiSecret              char(64) NOT NULL,
    mintJobId               char(32) NOT NULL,
    burntJobId              char(32) NOT NULL,
    interval                integer NOT NULL,
    network                 varchar(10),
  );`);
  await client.query(`CREATE TABLE ${supportedChainsDatabase} IF NOT EXISTS (
    chainId                 integer CONSTRAINT firstkey PRIMARY KEY,
    network                 varchar(10) NOT NULL,
    debridgeAddr            char(42) NOT NULL,
    latestBlock             integer NOT NULL,
    provider                varchar(200) NOT NULL,
  );`);
  // const text = `INSERT INTO ${chainConfigDatabase}(name, email) VALUES($1, $2) RETURNING *`;
}
async function createChainConfig(submissionId, submissionType, txHash) {}
async function getChainConfigs() {}
async function updateChainConfigs() {}

/* */
async function createSubmission(submissionId, submissionType, txHash) {}
async function getSubmission(submissionId) {}
async function updateSubmission(submissionId, txHash) {}

/* TODO: add logger */
const server = app.listen(process.env.PORT || 8080, async function () {
  const port = server.address().port;
  console.log("App now running on port", port);
  await connectDb();
  await createTables();
  // await subscribe();
});
