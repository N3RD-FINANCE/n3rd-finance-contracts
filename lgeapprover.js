
const Web3 = require('web3');
const web3 = new Web3();
var privateKey = "7cb0c2e9624b4090d213cfaf6cf090ef36687b064a39872d5c1d79a2cc1f66b6";
var address = "0x399640c741c38d2aa881ad06406d9fc433812f31";

module.exports = {
    signApprover: function (addr) {
        let msgHash = web3.utils.sha3(addr);
        return web3.eth.accounts.sign(msgHash, privateKey);
    },
    lgeApprover: address
}
