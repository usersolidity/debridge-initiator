require("dotenv-flow").config();
const express = require("express");
const bodyParser = require("body-parser");
const request = require("request");
const app = express();
const Web3 = require("web3");
const whiteDebridgeAbi = require("./assets/WhiteDebridge.json").abi;
const latestBlocks = {};

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
  const fromBlock = latestBlocks[supportedChain.network]
    ? latestBlocks[supportedChain.network]
    : toBlock - 100;
  console.log(fromBlock);
  console.log(toBlock);
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
  latestBlocks[supportedChain.network] = toBlock;
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

/* TODO: add logger */
const server = app.listen(process.env.PORT || 8080, function () {
  const port = server.address().port;
  console.log("App now running on port", port);
  subscribe();
});
