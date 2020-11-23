require('dotenv').config();
const Nerd = require("./build/contracts/Nerd.json");
const NerdVault = require("./build/contracts/NerdVault.json");
const FeeApprover = require("./build/contracts/FeeApprover.json");
const Web3 = require('web3');

const web3URL = process.env.WEB3URL;
const privateKey = process.env.PRIVATE_KEY;

const PrivateKeyProvider = require("truffle-privatekey-provider");

const provider = new PrivateKeyProvider(privateKey, web3URL);

const web3 = new Web3(provider);

const deploy = async () => {
    const accounts = await web3.eth.getAccounts();
    const mainAccount = accounts[0];

    console.log("Attempting to deploy from account: ", accounts[0]);

    const nerdContract = await new web3.eth.Contract(Nerd.abi, "0xa9F6C6ddbFdb9E610ACaA174B432576538775e29");

    //await feeApproverContract.methods.initialize(nerdContract.options.address).send({ gas: "7000000", from: mainAccount });
    const feeApproverContract = await new web3.eth.Contract(FeeApprover.abi, "0xf2D5f6659411F257c120d40aFE08173fab6B4eB4");
    
    //await feeApproverContract.methods.setPaused(false).send({ gas: "7000000", from: mainAccount });
    console.log("set paused fee approver");

    //await nerdContract.methods.setShouldTransferChecker(feeApproverContract.options.address).send({ gas: "7000000", from: mainAccount });
    console.log("set transfer checker");
    
    const nerdVaultContract = await new web3.eth.Contract(NerdVault.abi, "0xb89A8fcA70de3a86557F2D2d722c589897Ff0824");

    console.log('fee distributor:')
    await nerdContract.methods.setFeeDistributor(nerdVaultContract.options.address).send({ gas: "7000000", from: mainAccount });
    //await nerdVaultContract.methods.initialize(nerdContract.options.address, "0x537f25c26880dd5fe2A0daF149A2314e9DB6Dc68").send({ gas: "7000000", from: mainAccount });
    //console.log("initialize nerd vault");
    
    //await feeApproverContract.methods.setNerdVaultAddress(nerdVaultContract.options.address).send({ gas: "7000000", from: mainAccount });
    console.log("set nerd vault address");

    //waiting 120s
    //await new Promise(resolve => setTimeout(resolve, 120000));
    //console.log('calling adding liquidity');
    //await nerdContract.methods.addLiquidityToUniswapNERDxWETHPair().send({ gas: "7000000", from: mainAccount });
};
deploy();