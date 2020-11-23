require('dotenv').config();
const AddLiquidityWrapper = require("./build/contracts/Wrapper.json");
const getConfig = require("./getConfig");
const Web3 = require("web3");

let nerdAddress = process.argv[2];
console.log('nerd:', nerdAddress)

const provider = getConfig.getProvider();

const web3 = new Web3(provider);

const deploy = async () => {
    const accounts = await web3.eth.getAccounts();
    const mainAccount = accounts[0];

    console.log("Attempting to deploy from account: ", accounts[0]);

    const wrapper = await new web3.eth.Contract(AddLiquidityWrapper.abi)
        .deploy({ data: AddLiquidityWrapper.bytecode })
        .send({ gas: "2000000", from: mainAccount });

    //This will display the address to which your contract was deployed
    console.log("Contract AddLiquidityWrapper deployed to: ", wrapper.options.address);
    await wrapper.methods.setNerd(nerdAddress).send({ from: mainAccount });
};
deploy();