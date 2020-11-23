const WETH9 = artifacts.require('WETH9');
const UniswapV2Factory = artifacts.require('UniswapV2Factory');
const UniswapV2Router02 = artifacts.require('UniswapV2Router02');

const config = {
    network: "local",
    routerAddress: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    factoryAddress: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
    wethAddress: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    readUniswap: async function (t) {
        t.weth = await WETH9.at(config.wethAddress);
        t.factory = await UniswapV2Factory.at(config.factoryAddress);
        t.router = await UniswapV2Router02.at(config.routerAddress);
    }
}

module.exports = config;