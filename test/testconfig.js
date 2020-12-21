const WETH9 = artifacts.require('WETH9');
const UniswapV2Factory = artifacts.require('UniswapV2Factory');
const UniswapV2Router02 = artifacts.require('UniswapV2Router02');
const UniswapV2Pair = artifacts.require('UniswapV2Pair');
const NerdVault = artifacts.require("NerdVault");
const NerdToken = artifacts.require("Nerd");
const FeeApprover = artifacts.require("FeeApprover");
const IERC20 = artifacts.require("IERC20");
const Web3 = require('web3');
const PrivateKeyProvider = require("truffle-privatekey-provider");

const config = {
    network: process.env.NODE_ENV ? process.env.NODE_ENV : "local",
    routerAddress: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    factoryAddress: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
    wethAddress: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    usdtAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    daiAddress: "0x6b175474e89094c44da98b954eedeac495271d0f",
    usdcAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    routerAddress: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    factoryAddress: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
    readUniswap: async function (t) {
        t.weth = await WETH9.at(config.wethAddress);
        t.factory = await UniswapV2Factory.at(config.factoryAddress);
        t.router = await UniswapV2Router02.at(config.routerAddress);
        t.nerd = await NerdToken.at("0x32C868F6318D6334B2250F323D914Bc2239E4EeE");
        t.nerdvault = await NerdVault.at("0x47cE2237d7235Ff865E1C74bF3C6d9AF88d1bbfF");
        let feeApproverAddress = (await t.nerd.transferCheckerAddress()).valueOf().toString();
        this.feeapprover = await FeeApprover.at(feeApproverAddress);
        t.usdt = await IERC20.at(config.usdtAddress);
        t.dai = await IERC20.at(config.daiAddress);
        t.usdc = await IERC20.at(config.usdcAddress);
        t.nerdWETHPair = await UniswapV2Pair.at("0x3473C92d47A2226B1503dFe7C929b2aE454F6b22");
    },
    transferOwnership: async function (to) {
        let web3 = await new Web3(new PrivateKeyProvider(process.env.PRIVATE_KEY_PROD, "http://localhost:7545"));
        let address = web3.currentProvider.address;
        let nerdVault = await new web3.eth.Contract(NerdVault.abi, "0x47cE2237d7235Ff865E1C74bF3C6d9AF88d1bbfF");
        await nerdVault.methods.transferOwnership(to).send({ from: address });
    }
}

module.exports = config;