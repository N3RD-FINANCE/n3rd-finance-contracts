require('dotenv').config();
var network = process.env.NODE_ENV;

const Web3 = require('web3');
const PrivateKeyProvider = require("truffle-privatekey-provider");

const GetConfig = {
    getPrivateKey: function () {
        if (network == "dev") {
            return process.env.PRIVATE_KEY_DEV;
        } else if (network == "test") {
            return process.env.PRIVATE_KEY_TEST;
        } else if (network == "main") {
            return process.env.PRIVATE_KEY_PROD;
        }
    },
    getWeb3URL: function () {
        if (network == "dev") {
            return process.env.WEB3URL_DEV;
        } else if (network == "test") {
            return process.env.WEB3URL_TEST;
        } else if (network == "main") {
            return process.env.WEB3URL_PROD;
        }
    },
    getProvider: function () {
        if (network == "dev") {
            return new PrivateKeyProvider(GetConfig.getPrivateKey(), GetConfig.getWeb3URL());
        } else if (network == "main")
            return new PrivateKeyProvider(GetConfig.getPrivateKey(), GetConfig.getWeb3URL());
    },
    isDevNet: function () {
        return network == "dev";
    },
    getLGEPeriod: function () {
        if (network == "dev") {
            return "900";
        } else if (network == "test") {
            return "42400";
        } else if (network == "main") {
            return "0";
        }
    },
    getDevAddress: function () {
        if (network == "dev") {
            return process.env.DEV_ADDRESS_DEV;
        } else if (network == "test") {
            return process.env.DEV_ADDRESS_TEST;
        } else if (network == "main") {
            return process.env.DEV_ADDRESS_PROD;
        }
    },
    getApproverAddress: function () {
        if (network == "dev") {
            return process.env.APPROVER_ADDRESS_DEV;
        } else if (network == "test") {
            return process.env.APPROVER_ADDRESS_TEST;
        } else if (network == "main") {
            return process.env.APPROVER_ADDRESS_PROD;
        }
    },
}

module.exports = GetConfig;
