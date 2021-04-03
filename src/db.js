const { Pool } = require("pg");
const chainConfigDatabase = process.env.CHAIN_CONFIG_DATABASE;
const supportedChainsDatabase = process.env.SUPPORTED_CHAINS_DATABASE;
const submissionsDatabase = process.env.SUBMISSIONS_DATABASE;

class Db {
  constructor() {
    this.pool = new Pool();
    this.pgClient;
  }

  async connectDb() {
    this.pgClient = await this.pool.connect();
  }

  async createTables() {
    // await this.pgClient.query(`drop table if exists ${submissionsDatabase} ;`);
    // await this.pgClient.query(
    //   `drop table if exists ${supportedChainsDatabase} ;`
    // );
    // await this.pgClient.query(`drop table if exists ${chainConfigDatabase} ;`);
    await this.pgClient
      .query(`create table if not exists ${supportedChainsDatabase} (
          chainId                 integer primary key,
          network                 varchar(10),
          debridgeAddr            char(42),
          latestBlock             integer,
          provider                varchar(200),
          interval                integer
        );`);

    await this.pgClient
      .query(`create table if not exists ${chainConfigDatabase} (
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

    await this.pgClient
      .query(`create table if not exists ${submissionsDatabase} (
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

    await this.createSupportedChain(
      56,
      0,
      "bsc",
      "ws://46.4.15.216:8546/",
      "0xFAE07FAB51c38aC037b648c304D4dF30681B7399",
      15000
    );
    await this.createSupportedChain(
      42,
      0,
      "eth",
      "https://kovan.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161",
      "0x9d088A627bb3110e4Cf66690F31A02a48B809387",
      15000
    );
    await this.createChainConfig(
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
    await this.createChainConfig(
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

  async createChainConfig(
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
    await this.pgClient.query(`insert into ${chainConfigDatabase} (
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

  async createSupportedChain(
    chainId,
    latestBlock,
    network,
    provider,
    debridgeAddr,
    interval
  ) {
    await this.pgClient.query(`insert into ${supportedChainsDatabase} (
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

  async createSubmission(
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
    await this.pgClient.query(`insert into ${submissionsDatabase} (
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

  async getChainConfigs() {
    const result = await this.pgClient.query(
      `select * from ${chainConfigDatabase};`
    );
    return result.rows;
  }

  async getChainConfig(chainId) {
    const result = await this.pgClient.query(
      `select * from ${chainConfigDatabase} where chainId = ${chainId};`
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async getSupportedChains() {
    const result = await this.pgClient.query(
      `select * from ${supportedChainsDatabase};`
    );
    return result.rows;
  }

  async getSubmissionsByStatus(status) {
    const result = await this.pgClient.query(
      `select * from ${submissionsDatabase} where status = ${status};`
    );
    return result.rows;
  }

  async getSubmission(submissionId) {
    const result = await this.pgClient
      .query(`select * from ${submissionsDatabase} 
        where submissionId = '${submissionId}';`);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async updateSupportedChainBlock(chainId, latestBlock) {
    await this.pgClient.query(`update ${supportedChainsDatabase} set 
        latestBlock = ${latestBlock}
        where chainId = ${chainId};`);
  }

  async updateSubmissionStatus(submissionId, status) {
    await this.pgClient.query(`update ${submissionsDatabase} set 
        status = ${status}
        where submissionId = '${submissionId}';`);
  }

  async updateSubmissionTxHash(submissionId, txHash) {
    await this.pgClient.query(`update ${submissionsDatabase} set 
        txHash = ${txHash}
        where submissionId = '${submissionId}';`);
  }

  async updateChainConfigCokie(chainId, cookie) {
    await this.pgClient.query(`update ${chainConfigDatabase} set 
        cookie = '${cookie}'
        where chainId = ${chainId};`);
  }
}

module.exports.Db = Db;
