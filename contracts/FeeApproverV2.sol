// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol"; // for WETH
import "./uniswapv2/interfaces/IUniswapV2Factory.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "./INerdBaseToken.sol";
import "./uniswapv2/interfaces/IUniswapV2Router02.sol"; // interface factorys

contract FeeApproverV2 is OwnableUpgradeSafe {
    using SafeMath for uint256;

    function initialize(address _NerdAddress) public initializer {
        OwnableUpgradeSafe.__Ownable_init();
        address nerdTokenAddress = _NerdAddress;
        address getUniswapRouterV2 = INerdBaseTokenLGE(nerdTokenAddress)
            .getUniswapRouterV2();
        feePercentX100 = 30;
        paused = false;
        _editNoFeeList(nerdTokenAddress, true); //this is to not apply fees for transfer from the token contrat itself
        _editNoFeeList(getUniswapRouterV2, true);
        //staking pool
        _editNoFeeList(0x357ADa6E0da1BB40668BDDd3E3aF64F472Cbd9ff, true);
        //vault master
        _editNoFeeList(0x47cE2237d7235Ff865E1C74bF3C6d9AF88d1bbfF, true);
        //distributor proxy
        _editNoFeeList(0xCB832C66E1d9b701fc39c024DcDC00Be7cb9E110, true);
        //community fundraise wallt
        _editNoFeeList(0x9A6D1905919d5E444A2653178B9472da77Fd3501, true);
        minFinney = 5000;
    }

    constructor() public {
        initialize(0x32C868F6318D6334B2250F323D914Bc2239E4EeE);
    }

    uint8 public feePercentX100; // max 255 = 25.5% artificial clamp
    bool paused;
    mapping(address => bool) public noFeeList;

    // NERD token is pausable
    function setPaused(bool _pause) public onlyOwner {
        paused = _pause;
    }

    function setFeeMultiplier(uint8 _feeMultiplier) public onlyOwner {
        feePercentX100 = _feeMultiplier;
    }

    function setNerdVaultAddress(address _nerdVaultAddress) public onlyOwner {
        noFeeList[_nerdVaultAddress] = true;
    }

    function editNoFeeList(address _address, bool noFee) public onlyOwner {
        _editNoFeeList(_address, noFee);
    }

    function _editNoFeeList(address _address, bool noFee) internal {
        noFeeList[_address] = noFee;
    }

    mapping(address => bool) public bots;

    function setBot(address[] calldata addrs, bool[] calldata vals)
        external
        onlyOwner
    {
        require(addrs.length == vals.length);
        for (uint256 i = 0; i < addrs.length; i++) {
            bots[addrs[i]] = vals[i];
        }
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
        require(!bots[sender]);

        if (noFeeList[sender] || noFeeList[recipient]) {
            // Dont have a fee when nerdvault is sending, or infinite loop
            transferToFeeDistributorAmount = 0;
            transferToAmount = amount;
        } else {
            uint256 actualFee = feePercentX100;
            transferToFeeDistributorAmount = amount.mul(actualFee).div(1000);
            transferToAmount = amount.sub(transferToFeeDistributorAmount);
        }
    }
}
