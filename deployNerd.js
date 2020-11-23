require('dotenv').config();
const Nerd = require("./build/contracts/Nerd.json");
const Web3 = require('web3');

const web3URL = process.env.WEB3URL;
const privateKey = process.env.PRIVATE_KEY;

const PrivateKeyProvider = require("truffle-privatekey-provider");

const provider = new PrivateKeyProvider(privateKey, web3URL);

const web3 = new Web3(provider);

const deploy = async () => {
    const accounts = await web3.eth.getAccounts();

    console.log("Attempting to deploy from account: ", accounts[0]);

    const result = await new web3.eth.Contract(Nerd.abi)
        .deploy({ data: Nerd.bytecode, arguments: ["0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000", "0x537f25c26880dd5fe2A0daF149A2314e9DB6Dc68"] })
        .send({ gas: "7000000", from: accounts[0] });

    //This will display the address to which your contract was deployed
    console.log("Contract deployed to: ", result.options.address);
};
deploy();