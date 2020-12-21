pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/Math.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol"; // for WETH
import "./uniswapv2/interfaces/IUniswapV2Pair.sol";
import "./uniswapv2/interfaces/IUniswapV2Factory.sol";
import "./uniswapv2/interfaces/IUniswapV2Router02.sol";
import "./uniswapv2/interfaces/IWETH.sol";
import "./INerdBaseToken.sol";
import "./IFeeApprover.sol";
import "./INerdVault.sol";
import "./uniswapv2/libraries/UniswapV2Library.sol";

interface IStakingPool {
    function depositFor(address _depositFor, uint256 _originAmount) external;
}

contract FarmETHRouter is OwnableUpgradeSafe {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    mapping(address => uint256) public hardNerd;

    address public _nerdToken;
    address public _nerdWETHPair;
    IFeeApprover public _feeApprover;
    INerdVault public _nerdVault;
    IWETH public _WETH;
    address public _uniV2Factory;
    address public _uniV2Router;

    function initialize() public initializer {
        OwnableUpgradeSafe.__Ownable_init();
        _nerdToken = 0x32C868F6318D6334B2250F323D914Bc2239E4EeE;
        _uniV2Factory = INerdBaseTokenLGE(_nerdToken).getUniswapFactory();
        _uniV2Router = INerdBaseTokenLGE(_nerdToken).getUniswapRouterV2();
        _WETH = IWETH(IUniswapV2Router02(_uniV2Router).WETH());
        _feeApprover = IFeeApprover(
            INerdBaseTokenLGE(_nerdToken).transferCheckerAddress()
        );
        _nerdWETHPair = INerdBaseTokenLGE(_nerdToken).getTokenUniswapPair();
        _nerdVault = INerdVault(0x47cE2237d7235Ff865E1C74bF3C6d9AF88d1bbfF);
        refreshApproval();
    }

    function refreshApproval() public {
        IUniswapV2Pair(_nerdWETHPair).approve(address(_nerdVault), uint256(-1));
    }

    event FeeApproverChanged(
        address indexed newAddress,
        address indexed oldAddress
    );

    fallback() external payable {
        if (msg.sender != address(_WETH)) {
            addLiquidityETHOnly(msg.sender, false);
        }
    }

    function safeTransferFrom(
        address token,
        address from,
        address to,
        uint256 value
    ) internal {
        // bytes4(keccak256(bytes('transferFrom(address,address,uint256)')));
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(0x23b872dd, from, to, value)
        );
        require(
            success && (data.length == 0 || abi.decode(data, (bool))),
            "TransferHelper: TRANSFER_FROM_FAILED"
        );
    }

    function safeTransferIn(address _source, uint256 _amount)
        internal
        returns (uint256)
    {
        uint256 sourceBalBefore = IERC20(_source).balanceOf(address(this));
        safeTransferFrom(_source, msg.sender, address(this), _amount);
        uint256 sourceBalAfter = IERC20(_source).balanceOf(address(this));
        return sourceBalAfter.sub(sourceBalBefore);
    }

    function stakeNerdByETH(address stakingPool) external payable {
        require(address(_WETH) != address(0), "invalid WETH");
        _WETH.deposit{value: msg.value}();
        stakeInternal(stakingPool, msg.value);
    }

    function stakeNerdByAnyToken(
        address stakingPool,
        address sourceToken,
        uint256 amount
    ) external {
        require(stakingPool != address(0), "invalid staking pool");
        uint256 sourceBal = safeTransferIn(sourceToken, amount);
        //get eth pair with source
        //swap source token for WETH
        IERC20(sourceToken).safeApprove(_uniV2Router, sourceBal);
        uint256 _ethAmount = sourceBal;
        if (address(_WETH) != sourceToken) {
            address[] memory path = new address[](2);
            path[0] = sourceToken;
            path[1] = address(_WETH);
            uint256 ethBefore = _WETH.balanceOf(address(this));
            IUniswapV2Router02(_uniV2Router).swapExactTokensForTokens(
                sourceBal,
                0,
                path,
                address(this),
                block.timestamp + 100
            );
            _ethAmount = _WETH.balanceOf(address(this)).sub(ethBefore);
        }
        stakeInternal(stakingPool, _ethAmount);
    }

    function stakeInternal(address stakingPool, uint256 _ethAmount) internal {
        (uint256 reserveWeth, uint256 reservenerd) = getPairReserves(
            address(_nerdWETHPair)
        );
        uint256 outnerd = UniswapV2Library.getAmountOut(
            _ethAmount,
            reserveWeth,
            reservenerd
        );
        _WETH.transfer(_nerdWETHPair, _ethAmount);
        (address token0, address token1) = UniswapV2Library.sortTokens(
            address(_WETH),
            _nerdToken
        );
        IUniswapV2Pair(_nerdWETHPair).swap(
            _nerdToken == token0 ? outnerd : 0,
            _nerdToken == token1 ? outnerd : 0,
            address(this),
            ""
        );
        outnerd = IERC20(_nerdToken).balanceOf(address(this));
        IERC20(_nerdToken).approve(stakingPool, outnerd);
        IStakingPool(stakingPool).depositFor(msg.sender, outnerd);
    }

    function addLiquidityByTokenForPool(
        address sourceToken,
        uint256 amount,
        uint256 pid,
        address payable to,
        bool autoStake
    ) external {
        uint256 sourceBal = safeTransferIn(sourceToken, amount);
        //get eth pair with source
        //swap source token for WETH
        IERC20(sourceToken).safeApprove(_uniV2Router, sourceBal);
        uint256 _ethAmount = sourceBal;
        if (address(_WETH) != sourceToken) {
            address[] memory path = new address[](2);
            path[0] = sourceToken;
            path[1] = address(_WETH);
            uint256 ethBefore = _WETH.balanceOf(address(this));
            IUniswapV2Router02(_uniV2Router).swapExactTokensForTokens(
                sourceBal,
                0,
                path,
                address(this),
                block.timestamp + 100
            );
            _ethAmount = _WETH.balanceOf(address(this)).sub(ethBefore);
        }
        _addLiquidityETHOnlyForPool(pid, to, autoStake, _ethAmount, false);
    }

    //this is only applied for pool 0: NERD-ETH
    function addLiquidityETHOnlyForPool(
        uint256 pid,
        address payable to,
        bool autoStake
    ) public payable {
        require(to != address(0), "Invalid address");
        _addLiquidityETHOnlyForPool(pid, to, autoStake, msg.value, true);
    }

    function _addLiquidityETHOnlyForPool(
        uint256 pid,
        address payable to,
        bool autoStake,
        uint256 _value,
        bool _needDeposit
    ) internal {
        hardNerd[msg.sender] = hardNerd[msg.sender].add(_value);
        uint256 buyAmount = _value.div(2);
        require(buyAmount > 0, "Insufficient ETH amount");
        (address lpAddress, , , , , , , , ) = _nerdVault.poolInfo(pid);
        IUniswapV2Pair pair = IUniswapV2Pair(lpAddress);
        address otherToken = pair.token0() == _nerdToken
            ? pair.token1()
            : pair.token0();

        require(
            otherToken != address(_WETH),
            "Please use addLiquidityETHOnly function"
        );
        if (_needDeposit) {
            _WETH.deposit{value: _value}();
        }

        uint256 outnerd = 0;
        uint256 outOther = 0;
        {
            //buy nerd
            address pairWithEth = _nerdWETHPair;
            (uint256 reserveWeth, uint256 reservenerd) = getPairReserves(
                pairWithEth
            );
            outnerd = UniswapV2Library.getAmountOut(
                buyAmount,
                reserveWeth,
                reservenerd
            );
            _WETH.transfer(pairWithEth, buyAmount);
            (address token0, address token1) = UniswapV2Library.sortTokens(
                address(_WETH),
                _nerdToken
            );
            IUniswapV2Pair(pairWithEth).swap(
                _nerdToken == token0 ? outnerd : 0,
                _nerdToken == token1 ? outnerd : 0,
                address(this),
                ""
            );
            outnerd = IERC20(_nerdToken).balanceOf(address(this));
        }

        {
            //buy other token
            address pairWithEth = IUniswapV2Factory(_uniV2Factory).getPair(
                address(_WETH),
                otherToken
            );
            (uint256 reserveWeth, uint256 reserveOther) = getPairReserves(
                pairWithEth
            );
            outOther = UniswapV2Library.getAmountOut(
                buyAmount,
                reserveWeth,
                reserveOther
            );
            _WETH.transfer(pairWithEth, buyAmount);
            (address token0, address token1) = UniswapV2Library.sortTokens(
                address(_WETH),
                otherToken
            );
            IUniswapV2Pair(pairWithEth).swap(
                otherToken == token0 ? outOther : 0,
                otherToken == token1 ? outOther : 0,
                address(this),
                ""
            );
            outOther = IERC20(otherToken).balanceOf(address(this));
        }

        _addLiquidityForPool(
            pid,
            address(pair),
            outnerd,
            otherToken,
            outOther,
            to,
            autoStake
        );
    }

    //this is only applied for pool 0: NERD-ETH
    function addLiquidityETHOnly(address payable to, bool autoStake)
        public
        payable
    {
        require(to != address(0), "Invalid address");
        hardNerd[msg.sender] = hardNerd[msg.sender].add(msg.value);
        uint256 buyAmount = msg.value.div(2);
        require(buyAmount > 0, "Insufficient ETH amount");
        require(address(_WETH) != address(0), "invalid WETH");
        _WETH.deposit{value: msg.value}();
        (uint256 reserveWeth, uint256 reservenerd) = getPairReserves(
            address(_nerdWETHPair)
        );
        uint256 outnerd = UniswapV2Library.getAmountOut(
            buyAmount,
            reserveWeth,
            reservenerd
        );
        _WETH.transfer(_nerdWETHPair, buyAmount);
        (address token0, address token1) = UniswapV2Library.sortTokens(
            address(_WETH),
            _nerdToken
        );
        IUniswapV2Pair(_nerdWETHPair).swap(
            _nerdToken == token0 ? outnerd : 0,
            _nerdToken == token1 ? outnerd : 0,
            address(this),
            ""
        );
        outnerd = IERC20(_nerdToken).balanceOf(address(this));
        _addLiquidityPool0(outnerd, buyAmount, to, autoStake);
    }

    function _addLiquidityForPool(
        uint256 pid,
        address pair,
        uint256 nerdAmount,
        address otherAddress,
        uint256 otherAmount,
        address payable to,
        bool autoStake
    ) internal {
        if (IERC20(pair).totalSupply() == 0) {
            IERC20(_nerdToken).approve(_uniV2Router, uint256(-1));
            IERC20(otherAddress).approve(_uniV2Router, uint256(-1));
            if (autoStake) {
                IUniswapV2Router02(_uniV2Router).addLiquidity(
                    _nerdToken,
                    otherAddress,
                    nerdAmount,
                    otherAmount,
                    0,
                    0,
                    address(this),
                    block.timestamp + 100
                );
                IUniswapV2Pair(pair).approve(address(_nerdVault), uint256(-1));
                _nerdVault.depositFor(
                    to,
                    pid,
                    IUniswapV2Pair(pair).balanceOf(address(this))
                );
            } else {
                IUniswapV2Router02(_uniV2Router).addLiquidity(
                    _nerdToken,
                    otherAddress,
                    nerdAmount,
                    otherAmount,
                    0,
                    0,
                    to,
                    block.timestamp + 100
                );
            }
            return;
        }
        (uint256 reserve0, uint256 reserve1, ) = IUniswapV2Pair(pair)
            .getReserves();
        (uint256 nerdReserve, uint256 otherTokenReserve) = (IUniswapV2Pair(pair)
            .token0() == otherAddress)
            ? (reserve1, reserve0)
            : (reserve0, reserve1);

        uint256 optimalnerdAmount = UniswapV2Library.quote(
            otherAmount,
            otherTokenReserve,
            nerdReserve
        );

        uint256 optimalOtherAmount;
        if (optimalnerdAmount > nerdAmount) {
            optimalOtherAmount = UniswapV2Library.quote(
                nerdAmount,
                nerdReserve,
                otherTokenReserve
            );
            optimalnerdAmount = nerdAmount;
        } else optimalOtherAmount = otherAmount;

        assert(IERC20(otherAddress).transfer(pair, optimalOtherAmount));
        assert(IERC20(_nerdToken).transfer(pair, optimalnerdAmount));

        if (autoStake) {
            IUniswapV2Pair(pair).mint(address(this));
            IUniswapV2Pair(pair).approve(address(_nerdVault), uint256(-1));
            _nerdVault.depositFor(
                to,
                pid,
                IUniswapV2Pair(pair).balanceOf(address(this))
            );
        } else IUniswapV2Pair(pair).mint(to);

        //refund dust
        if (IERC20(_nerdToken).balanceOf(address(this)) > 0)
            IERC20(_nerdToken).transfer(
                to,
                IERC20(_nerdToken).balanceOf(address(this))
            );

        if (IERC20(otherAddress).balanceOf(address(this)) > 0) {
            IERC20(otherAddress).transfer(
                to,
                IERC20(otherAddress).balanceOf(address(this))
            );
        }
    }

    function _addLiquidityPool0(
        uint256 nerdAmount,
        uint256 wethAmount,
        address payable to,
        bool autoStake
    ) internal {
        (uint256 wethReserve, uint256 nerdReserve) = getPairReserves(
            address(_nerdWETHPair)
        );

        uint256 optimalnerdAmount = UniswapV2Library.quote(
            wethAmount,
            wethReserve,
            nerdReserve
        );

        uint256 optimalWETHAmount;
        if (optimalnerdAmount > nerdAmount) {
            optimalWETHAmount = UniswapV2Library.quote(
                nerdAmount,
                nerdReserve,
                wethReserve
            );
            optimalnerdAmount = nerdAmount;
        } else optimalWETHAmount = wethAmount;

        assert(_WETH.transfer(_nerdWETHPair, optimalWETHAmount));
        assert(IERC20(_nerdToken).transfer(_nerdWETHPair, optimalnerdAmount));

        if (autoStake) {
            IUniswapV2Pair(_nerdWETHPair).mint(address(this));
            _nerdVault.depositFor(
                to,
                0,
                IUniswapV2Pair(_nerdWETHPair).balanceOf(address(this))
            );
        } else IUniswapV2Pair(_nerdWETHPair).mint(to);

        //refund dust
        if (IERC20(_nerdToken).balanceOf(address(this)) > 0)
            IERC20(_nerdToken).transfer(
                to,
                IERC20(_nerdToken).balanceOf(address(this))
            );

        if (_WETH.balanceOf(address(this)) > 0) {
            uint256 withdrawAmount = _WETH.balanceOf(address(this));
            _WETH.withdraw(withdrawAmount);
            to.transfer(withdrawAmount);
        }
    }

    function changeFeeApprover(address feeApprover) external onlyOwner {
        address oldAddress = address(_feeApprover);
        _feeApprover = IFeeApprover(feeApprover);

        emit FeeApproverChanged(feeApprover, oldAddress);
    }

    function getLPTokenPerEthUnit(uint256 ethAmt)
        public
        view
        returns (uint256 liquidity)
    {
        (uint256 reserveWeth, uint256 reservenerd) = getPairReserves(
            _nerdWETHPair
        );
        uint256 outnerd = UniswapV2Library.getAmountOut(
            ethAmt.div(2),
            reserveWeth,
            reservenerd
        );
        uint256 _totalSupply = IUniswapV2Pair(_nerdWETHPair).totalSupply();

        (address token0, ) = UniswapV2Library.sortTokens(
            address(_WETH),
            _nerdToken
        );
        (uint256 amount0, uint256 amount1) = token0 == _nerdToken
            ? (outnerd, ethAmt.div(2))
            : (ethAmt.div(2), outnerd);
        (uint256 _reserve0, uint256 _reserve1) = token0 == _nerdToken
            ? (reservenerd, reserveWeth)
            : (reserveWeth, reservenerd);
        liquidity = Math.min(
            amount0.mul(_totalSupply) / _reserve0,
            amount1.mul(_totalSupply) / _reserve1
        );
    }

    function getPairReserves(address _pair)
        internal
        view
        returns (uint256 wethReserves, uint256 otherTokenReserves)
    {
        address token0 = IUniswapV2Pair(_pair).token0();
        (uint256 reserve0, uint256 reserve1, ) = IUniswapV2Pair(_pair)
            .getReserves();
        (wethReserves, otherTokenReserves) = token0 == address(_WETH)
            ? (reserve0, reserve1)
            : (reserve1, reserve0);
    }
}
