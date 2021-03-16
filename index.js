require("dotenv-flow").config();
const express = require("express");
const bodyParser = require("body-parser");
const request = require("request");
const app = express();
const Web3 = require("web3");
// const abiDecoder = require("abi-decoder");
const registerAbi = require("./abi/Register.json").abi;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const EI_IC_ACCESSKEY = process.env.EI_IC_ACCESSKEY;
const EI_IC_SECRET = process.env.EI_IC_SECRET;
const EI_CHAINLINKURL = process.env.EI_CHAINLINKURL;
const JOB_ID = process.env.JOB_ID;
const CHAIN_CONFIGS = JSON.parse(process.env.CHAIN_CONFIGS);

/* health check endpoint */
app.get("/", function (req, res) {
  res.sendStatus(200);
});

/* call the chainlink node and run a job */
function subscribe() {
  for (let chainConfig of CHAIN_CONFIGS) {
    const web3 = new Web3(chainConfig.provider);
    const registerInstance = new web3.eth.Contract(
      registerAbi,
      chainConfig.registerAddr
    );
    registerInstance.events
      .Deposit(function (error, event) {
        console.log(event);
      })
      .on("data", processNewDeposit)
      .on("changed", function (event) {
        /* TODO: add cancel for reverted trx */
      });
  }
}

/* proccess new deposit event */
function processNewDeposit(deposit) {
  /* TODO: add block confirmation */

  /* notify oracle node*/
  callChainlinkNode(deposit.raw.data.commitment);
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
