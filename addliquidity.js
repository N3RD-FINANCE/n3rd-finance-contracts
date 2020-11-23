require('dotenv').config();
const Nerd = require("./build/contracts/Nerd.json");
const NerdVault = require("./build/contracts/NerdVault.json");
const FeeApprover = require("./build/contracts/FeeApprover.json");
const Router = require("./build/contracts/UniswapV2Router02.json");
const Factory = require("./build/contracts/UniswapV2Factory.json");
const WETH = require("./build/contracts/WETH9.json");
const Web3 = require('web3');
const getConfig = require('./getConfig');
const nerdAddress = process.argv[2];

const provider = getConfig.getProvider();

const web3 = new Web3(provider);

const deploy = async () => {
    const accounts = await web3.eth.getAccounts();
    const mainAccount = accounts[0];

    console.log("Attempting to send from account: ", accounts[0]);

    let nerdContract = await new web3.eth.Contract(Nerd.abi, nerdAddress);
    await nerdContract.methods.addLiquidityToUniswapNERDxWETHPair().send({ gas: "7000000", from: mainAccount });
};
deploy();