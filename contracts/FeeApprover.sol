// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol"; // for WETH
import "@nomiclabs/buidler/console.sol";
import "./uniswapv2/interfaces/IUniswapV2Factory.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "./INerdBaseToken.sol";
import "./uniswapv2/interfaces/IUniswapV2Router02.sol"; // interface factorys

contract FeeApprover is OwnableUpgradeSafe {
    using SafeMath for uint256;

    function initialize(address _NerdAddress) public initializer {
        OwnableUpgradeSafe.__Ownable_init();
        nerdTokenAddress = _NerdAddress;
        uniswapFactory = IUniswapV2Factory(
            INerdBaseTokenLGE(nerdTokenAddress).getUniswapFactory()
        );
        address getUniswapRouterV2 = INerdBaseTokenLGE(nerdTokenAddress)
            .getUniswapRouterV2();
        WETHAddress = IUniswapV2Router02(getUniswapRouterV2).WETH();
        tokenUniswapPair = IUniswapV2Factory(uniswapFactory).getPair(
            WETHAddress,
            nerdTokenAddress
        );
        feePercentX100 = 20;
        paused = true; // We start paused until sync post LGE happens.
        //_editNoFeeList(0xC5cacb708425961594B63eC171f4df27a9c0d8c9, true); // nerdvault proxy
        _editNoFeeList(tokenUniswapPair, true);
        _editNoFeeList(nerdTokenAddress, true); //this is to not apply fees for transfer from the token contrat itself
        _editNoFeeList(getUniswapRouterV2, true);
        minFinney = 5000;
        feeReduceTimestamp = block.timestamp.add(30 days);
    }

    address tokenUniswapPair;
    IUniswapV2Factory public uniswapFactory;
    address internal WETHAddress;
    address nerdTokenAddress;
    address nerdVaultAddress;
    uint8 public feePercentX100; // max 255 = 25.5% artificial clamp
    bool paused;
    mapping(address => bool) public noFeeList;
    uint256 feeReduceTimestamp;

    // NERD token is pausable
    function setPaused(bool _pause) public onlyOwner {
        paused = _pause;
    }

    function setFeeMultiplier(uint8 _feeMultiplier) public onlyOwner {
        feePercentX100 = _feeMultiplier;
    }

    function setNerdVaultAddress(address _nerdVaultAddress) public onlyOwner {
        nerdVaultAddress = _nerdVaultAddress;
        noFeeList[nerdVaultAddress] = true;
    }

    function editNoFeeList(address _address, bool noFee) public onlyOwner {
        _editNoFeeList(_address, noFee);
    }

    function _editNoFeeList(address _address, bool noFee) internal {
        noFeeList[_address] = noFee;
    }

    uint256 minFinney; // 2x for $ liq amount

    function setMinimumLiquidityToTriggerStop(uint256 finneyAmnt)
        public
        onlyOwner
    {
        // 1000 = 1eth
        minFinney = finneyAmnt;
    }

    function calculateAmountsAfterFee(
        address sender,
        address recipient, // unusued maybe use din future
        uint256 amount
    )
        public
        returns (
            uint256 transferToAmount,
            uint256 transferToFeeDistributorAmount
        )
    {
        require(paused == false, "FEE APPROVER: Transfers Paused");

        if (noFeeList[sender]) {
            // Dont have a fee when nerdvault is sending, or infinite loop
            console.log("Sending without fee"); // And when pair is sending ( buys are happening, no tax on it)
            transferToFeeDistributorAmount = 0;
            transferToAmount = amount;
        } else {
            console.log("Normal fee transfer");
            uint256 actualFee = feeReduceTimestamp < block.timestamp
                ? feePercentX100 / 2
                : feePercentX100;
            transferToFeeDistributorAmount = amount.mul(actualFee).div(1000);
            transferToAmount = amount.sub(transferToFeeDistributorAmount);
        }
    }
}
