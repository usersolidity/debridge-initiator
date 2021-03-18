require("dotenv-flow").config();
const express = require("express");
const bodyParser = require("body-parser");
const request = require("request");
const app = express();
const Web3 = require("web3");
// const abiDecoder = require("abi-decoder");
const whiteDebridgeAbi = require("./assets/WhiteDebridge.json").abi;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const EI_IC_ACCESSKEY = process.env.EI_IC_ACCESSKEY;
const EI_IC_SECRET = process.env.EI_IC_SECRET;
const EI_CHAINLINKURL = process.env.EI_CHAINLINKURL;
const JOB_ID = process.env.JOB_ID;
const CHAIN_ID = process.env.CHAIN_ID;
const chainConfigs = require("./assets/ChainConfig.json");

/* health check endpoint */
app.get("/", function (req, res) {
  res.sendStatus(200);
});

/* call the chainlink node and run a job */
async function subscribe() {
  for (let chainConfig of chainConfigs) {
    const web3 = new Web3(chainConfig.provider);
    const registerInstance = new web3.eth.Contract(
      whiteDebridgeAbi,
      chainConfig.debridgeAddr
    );

    registerInstance.getPastEvents(
      "Sent",
      { fromBlock: 7173606, toBlock: "latest" },
      processNewTransfer
    );
    registerInstance.getPastEvents(
      "Burnt",
      { fromBlock: 23965348 },
      processNewTransfer
    );
  }
}

/* proccess new deposit event */
function processNewTransfer(err, events) {
  console.log(events);
  for (let e of events) {
    /* TODO: add block confirmation */

    /* remove chainIdTo function selector */
    const chainIdTo = e.returnValues.chainIdTo;
    if (chainIdTo != CHAIN_ID) continue;

    /* add function selector */
    const functionId = e.event === "Sent" ? "0x435f7bcd" : "0x2288c5cf";

    const data = "" + e.raw.data.slice(2, e.raw.data.length - 64);

    console.log(e.raw.data);
    console.log(data);

    /* notify oracle node*/
    callChainlinkNode(data);
  }
}

/* call the chainlink node and run a job */
function callChainlinkNode(data) {
  const url_addon = "/v2/specs/" + JOB_ID + "/runs";
  request.post(
    {
      headers: {
        "content-type": "application/json",
        "X-Chainlink-EA-AccessKey": EI_IC_ACCESSKEY,
        "X-Chainlink-EA-Secret": EI_IC_SECRET,
      },
      url: EI_CHAINLINKURL + url_addon,
      body: `{"result" : "${data}"}`,
    },
    console.log
  );
}

/* TODO: add logger */
const server = app.listen(process.env.PORT || 3002, function () {
  const port = server.address().port;
  console.log("App now running on port", port);
  subscribe();
});
