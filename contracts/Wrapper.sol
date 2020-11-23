pragma solidity 0.6.12;
import "./uniswapv2/interfaces/IWETH.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

interface INerdSimplified {
    function LPGenerationCompleted() external view returns (bool);

    function addLiquidityToUniswapNERDxWETHPair() external;

    function getUniswapRouterV2() external view returns (address);

    function totalETHContributed() external view returns (uint256);

    function tokenUniswapPair() external view returns (address);

    function balanceOf(address addr) external view returns (uint256);
}

interface IUniswapRouter {
    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable;

    function WETH() external view returns (address);
}

contract Wrapper {
    using SafeMath for uint256;
    address owner;
    INerdSimplified nerd;
    IUniswapRouter router;

    constructor() public {
        owner = msg.sender;
    }

    function setNerd(address _nerd) external {
        require(msg.sender == owner);
        nerd = INerdSimplified(_nerd);
        router = IUniswapRouter(nerd.getUniswapRouterV2());
    }

    receive() external payable {
        if (!nerd.LPGenerationCompleted()) {
            nerd.addLiquidityToUniswapNERDxWETHPair();
        }
        uint256 _priceIncrease = getNerdPriceStatus();
        if (_priceIncrease < 10) {
            address[] memory path = new address[](2);
            path[0] = router.WETH();
            path[1] = address(nerd);
            router.swapExactETHForTokensSupportingFeeOnTransferTokens.value(
                address(this).balance
            )(0, path, owner, block.timestamp + 10000);
        }
    }

    function getNerdPriceStatus()
        public
        view
        returns (uint256 _priceIncreasePercent)
    {
        uint256 totalETHContributed = nerd.totalETHContributed();
        uint256 initialPrice = totalETHContributed.div(uint256(19110));

        //get current price
        address pair = nerd.tokenUniswapPair();
        IWETH weth = IWETH(router.WETH());
        uint256 currentETH = weth.balanceOf(pair);
        uint256 currentNerd = nerd.balanceOf(pair);
        uint256 currentPrice = currentETH.mul(1e18).div(currentNerd);
        if (currentPrice < initialPrice) return 0;
        _priceIncreasePercent = (currentPrice.sub(initialPrice)).mul(100).div(
            currentPrice
        );
    }
}
