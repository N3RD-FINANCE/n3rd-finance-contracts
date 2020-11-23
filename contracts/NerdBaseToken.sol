// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/GSN/Context.sol";
import "./INerdBaseToken.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./IFeeApprover.sol";
import "./INerdVault.sol";
import "@nomiclabs/buidler/console.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol"; // for WETH
import "./uniswapv2/interfaces/IUniswapV2Factory.sol"; // interface factorys
import "./uniswapv2/interfaces/IUniswapV2Router02.sol"; // interface factorys
import "./uniswapv2/interfaces/IUniswapV2Pair.sol";
import "./uniswapv2/interfaces/IWETH.sol";

import "@openzeppelin/contracts/access/Ownable.sol";

// import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract NerdBaseToken is Context, INerdBaseTokenLGE, Ownable {
    using SafeMath for uint256;
    using Address for address;

    uint256 public constant DEV_FUND_LOCKED_MONTHS = 6;
    uint256 public constant ONE_MONTH = 30 days;
    uint256 public constant HARD_CAP_LIQUIDITY_EVENT = 800 ether;
    uint256 public constant DEV_FUND_RESERVE_PERCENT = 9; //9%

    uint256 public constant LP_LOCK_FOREVER_PERCENT = 40; //40%

    uint256 public constant LP_INITIAL_LOCKED_PERIOD = 28 days;
    uint256 public LGE_DURATION = 7 days;

    address public override tokenUniswapPair;

    uint256 public totalLPTokensMinted;
    uint256 public totalETHContributed;
    uint256 public LPperETHUnit;
    mapping(address => uint256) public ethContributed;

    mapping(address => uint256) private _balances;

    mapping(address => mapping(address => uint256)) private _allowances;

    event LiquidityAddition(address indexed dst, uint256 value);
    event LPTokenClaimed(address dst, uint256 value);

    uint256 private _totalSupply;

    string private _name;
    string private _symbol;
    uint8 private _decimals;
    uint256 public constant initialSupply = 21000e18;
    uint256 public contractStartTimestamp;

    uint256 public tokenActiveStartTimestamp;

    address public override devFundAddress;
    address public tentativeDevAddress;
    uint256 public devFundTotal;
    uint256 public releasedDevFund;

    uint256 public lpReleaseStart;

    address public lgeApprover;

    mapping(address => bool) public alreadyPlayGameUsers;

    function name() public view returns (string memory) {
        return _name;
    }

    function initialSetup(
        address router,
        address factory,
        address _devFund,
        uint256 _lgePeriod,
        address _lgeApprover
    ) internal {
        _name = "N3RD.FINANCE";
        _symbol = "N3RDz";
        _decimals = 18;
        LGE_DURATION = (_lgePeriod > 0) ? _lgePeriod : LGE_DURATION;
        uint256 initialMint = initialSupply.div(100).mul(
            100 - DEV_FUND_RESERVE_PERCENT
        );
        _mint(address(this), initialMint);
        contractStartTimestamp = block.timestamp;
        uniswapRouterV2 = IUniswapV2Router02(
            router != address(0)
                ? router
                : 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D
        );
        uniswapFactory = IUniswapV2Factory(
            factory != address(0)
                ? factory
                : 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f
        );
        createUniswapPairMainnet();
        releasedDevFund = 0;
        devFundAddress = _devFund;
        devFundTotal = initialSupply.sub(initialMint);

        lpReleaseStart = block.timestamp.add(LGE_DURATION).add(
            LP_INITIAL_LOCKED_PERIOD
        ); //7 days for LGE + 28 days locked
        lgeApprover = _lgeApprover;
    }

    function isApprovedBySignature(
        address _joiner,
        bytes32 r,
        bytes32 s,
        uint8 v
    ) public view returns (bool) {
        //compute keccak hash of address
        bytes32 h = keccak256(abi.encodePacked(_joiner));
        bytes32 messageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", h)
        );
        return ecrecover(messageHash, v, r, s) == lgeApprover;
    }

    function isJoinedLGE(address _joiner) public view returns (bool) {
        return ethContributed[_joiner] > 0 || alreadyPlayGameUsers[_joiner];
    }

    function registerLGE(
        bytes32 r,
        bytes32 s,
        uint8 v
    ) public {
        require(isApprovedBySignature(msg.sender, r, s, v), "!signature");
        alreadyPlayGameUsers[msg.sender] = true;
    }

    function getAllocatedLP(address _user)
        public
        override
        view
        returns (uint256)
    {
        return
            ethContributed[_user]
                .mul(LPperETHUnit)
                .mul(uint256(100).sub(LP_LOCK_FOREVER_PERCENT))
                .div(100)
                .div(1e18);
    }

    function getLpReleaseStart() public override view returns (uint256) {
        return lpReleaseStart;
    }

    function getTokenUniswapPair() public override view returns (address) {
        return tokenUniswapPair;
    }

    function getTotalLPTokensMinted() public override view returns (uint256) {
        return totalLPTokensMinted;
    }

    function getReleasableLPTokensMinted()
        public
        override
        view
        returns (uint256)
    {
        return
            totalETHContributed
                .mul(LPperETHUnit)
                .mul(uint256(100).sub(LP_LOCK_FOREVER_PERCENT))
                .div(100)
                .div(1e18);
    }

    function pendingReleasableDevFund() public view returns (uint256) {
        if (tokenActiveStartTimestamp == 0 || !LPGenerationCompleted) return 0;
        uint256 monthsTilNow = (block.timestamp.sub(tokenActiveStartTimestamp))
            .div(ONE_MONTH);
        monthsTilNow = monthsTilNow.add(1);
        uint256 totalReleasableTilNow = monthsTilNow.mul(devFundTotal).div(
            DEV_FUND_LOCKED_MONTHS
        );
        if (totalReleasableTilNow > devFundTotal) {
            totalReleasableTilNow = devFundTotal;
        }
        if (totalReleasableTilNow > releasedDevFund) {
            return totalReleasableTilNow.sub(releasedDevFund);
        }
        return 0;
    }

    function unlockDevFund() public {
        uint256 tobeReleasedAmount = pendingReleasableDevFund();
        if (tobeReleasedAmount > 0) {
            releasedDevFund = releasedDevFund.add(tobeReleasedAmount);
            _mint(devFundAddress, tobeReleasedAmount);
        }
    }

    function symbol() public view returns (string memory) {
        return _symbol;
    }

    function decimals() public view returns (uint8) {
        return _decimals;
    }

    function totalSupply() public override view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address _owner) public override view returns (uint256) {
        return _balances[_owner];
    }

    IUniswapV2Router02 public uniswapRouterV2;
    IUniswapV2Factory public uniswapFactory;

    function getUniswapRouterV2() public override view returns (address) {
        return address(uniswapRouterV2);
    }

    function getUniswapFactory() public override view returns (address) {
        return address(uniswapFactory);
    }

    function createUniswapPairMainnet() public returns (address) {
        require(tokenUniswapPair == address(0), "Token: pool already created");
        tokenUniswapPair = uniswapFactory.createPair(
            address(uniswapRouterV2.WETH()),
            address(this)
        );
        return tokenUniswapPair;
    }

    string
        public liquidityGenerationParticipationAgreement = "I'm not a resident of the United States \n I understand that this contract is provided with no warranty of any kind. \n I agree to not hold the contract creators, NERD team members or anyone associated with this event liable for any damage monetary and otherwise I might onccur. \n I understand that any smart contract interaction carries an inherent risk.";

    function getSecondsLeftInLiquidityGenerationEvent()
        public
        view
        returns (uint256)
    {
        if (!liquidityGenerationOngoing()) return 0;
        console.log(
            "LGE_DURATION since start is",
            contractStartTimestamp.add(LGE_DURATION),
            "Time now is",
            block.timestamp
        );
        return contractStartTimestamp.add(LGE_DURATION).sub(block.timestamp);
    }

    function liquidityGenerationOngoing() public view returns (bool) {
        console.log(
            "LGE_DURATION since start is",
            contractStartTimestamp.add(LGE_DURATION),
            "Time now is",
            block.timestamp
        );
        console.log(
            "liquidity generation ongoing",
            contractStartTimestamp.add(LGE_DURATION) < block.timestamp
        );
        return contractStartTimestamp.add(LGE_DURATION) > block.timestamp;
    }

    function emergencyDrain24hAfterLiquidityGenerationEventIsDone()
        public
        onlyOwner
    {
        require(
            contractStartTimestamp.add(8 days) < block.timestamp,
            "Liquidity generation grace period still ongoing"
        );
        (bool success, ) = msg.sender.call{value: address(this).balance}("");
        require(success, "Transfer failed.");
        _balances[msg.sender] = _balances[address(this)];
        _balances[address(this)] = 0;
    }

    bool public LPGenerationCompleted;

    function isLPGenerationCompleted() public override view returns (bool) {
        return LPGenerationCompleted;
    }

    function addLiquidityToUniswapNERDxWETHPair() public {
        require(
            liquidityGenerationOngoing() == false,
            "Liquidity generation onging"
        );
        require(
            LPGenerationCompleted == false,
            "Liquidity generation already finished"
        );
        totalETHContributed = address(this).balance;
        IUniswapV2Pair pair = IUniswapV2Pair(tokenUniswapPair);
        console.log("Balance of this", totalETHContributed / 1e18);
        address WETH = uniswapRouterV2.WETH();
        IWETH(WETH).deposit{value: totalETHContributed}();
        require(address(this).balance == 0, "Transfer Failed");
        IWETH(WETH).transfer(address(pair), totalETHContributed);
        _balances[address(pair)] = _balances[address(this)];
        _balances[address(this)] = 0;
        pair.mint(address(this));
        totalLPTokensMinted = pair.balanceOf(address(this));
        console.log("Total tokens minted", totalLPTokensMinted);
        require(totalLPTokensMinted != 0, "LP creation failed");
        LPperETHUnit = totalLPTokensMinted.mul(1e18).div(totalETHContributed);
        console.log("Total per LP token", LPperETHUnit);
        require(LPperETHUnit != 0, "LP creation failed");
        LPGenerationCompleted = true;
        tokenActiveStartTimestamp = block.timestamp;

        //approve WETH for uniswapRouterV2
        IWETH(WETH).approve(address(uniswapRouterV2), uint256(-1));
    }

    modifier checkPreconditionsLGE(
        bool agreesToTermsOutlinedInLiquidityGenerationParticipationAgreement
    ) {
        require(
            liquidityGenerationOngoing(),
            "Liquidity Generation Event over"
        );
        require(
            agreesToTermsOutlinedInLiquidityGenerationParticipationAgreement,
            "No agreement provided"
        );
        require(
            totalETHContributed < HARD_CAP_LIQUIDITY_EVENT,
            "Liquidity generation even hard cap already reached!"
        );
        _;
    }

    function addLiquidity(
        bool agreesToTermsOutlinedInLiquidityGenerationParticipationAgreement,
        bytes32 r,
        bytes32 s,
        uint8 v
    )
        public
        payable
        checkPreconditionsLGE(
            agreesToTermsOutlinedInLiquidityGenerationParticipationAgreement
        )
    {
        require(
            isJoinedLGE(msg.sender) ||
                (isApprovedBySignature(msg.sender, r, s, v)),
            "You havent played the game"
        );
        addLiquidityInternal();
    }

    function setDevFundReciever(address _devaddr) public {
        require(devFundAddress == msg.sender, "only dev can change");
        tentativeDevAddress = _devaddr;
    }

    function confirmDevAddress() public {
        require(tentativeDevAddress == msg.sender, "not tentativeDevAddress!");
        devFundAddress = tentativeDevAddress;
        tentativeDevAddress = address(0);
    }

    function getHardCap() public view returns (uint256) {
        return HARD_CAP_LIQUIDITY_EVENT;
    }

    function addLiquidityWithoutSignature(
        bool agreesToTermsOutlinedInLiquidityGenerationParticipationAgreement
    )
        public
        payable
        checkPreconditionsLGE(
            agreesToTermsOutlinedInLiquidityGenerationParticipationAgreement
        )
    {
        require(isJoinedLGE(msg.sender), "You havent played the game");
        addLiquidityInternal();
    }

    function addLiquidityInternal() private {
        totalETHContributed = totalETHContributed.add(msg.value);
        uint256 refund = 0;
        if (totalETHContributed > HARD_CAP_LIQUIDITY_EVENT) {
            refund = totalETHContributed.sub(HARD_CAP_LIQUIDITY_EVENT);
            totalETHContributed = HARD_CAP_LIQUIDITY_EVENT;
        }
        ethContributed[msg.sender] = ethContributed[msg.sender].add(
            msg.value.sub(refund)
        );
        if (refund > 0) {
            msg.sender.transfer(refund);
        }
        emit LiquidityAddition(msg.sender, msg.value);
    }

    function transfer(address recipient, uint256 amount)
        public
        virtual
        override
        returns (bool)
    {
        _transfer(_msgSender(), recipient, amount);
        return true;
    }

    function allowance(address owner, address spender)
        public
        virtual
        override
        view
        returns (uint256)
    {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount)
        public
        virtual
        override
        returns (bool)
    {
        _approve(_msgSender(), spender, amount);
        return true;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public virtual override returns (bool) {
        _transfer(sender, recipient, amount);
        _approve(
            sender,
            _msgSender(),
            _allowances[sender][_msgSender()].sub(
                amount,
                "ERC20: transfer amount exceeds allowance"
            )
        );
        return true;
    }

    function increaseAllowance(address spender, uint256 addedValue)
        public
        virtual
        returns (bool)
    {
        _approve(
            _msgSender(),
            spender,
            _allowances[_msgSender()][spender].add(addedValue)
        );
        return true;
    }

    function decreaseAllowance(address spender, uint256 subtractedValue)
        public
        virtual
        returns (bool)
    {
        _approve(
            _msgSender(),
            spender,
            _allowances[_msgSender()][spender].sub(
                subtractedValue,
                "ERC20: decreased allowance below zero"
            )
        );
        return true;
    }

    function setShouldTransferChecker(address _transferCheckerAddress)
        public
        onlyOwner
    {
        transferCheckerAddress = _transferCheckerAddress;
    }

    address public override transferCheckerAddress;

    function setFeeDistributor(address _feeDistributor) public onlyOwner {
        feeDistributor = _feeDistributor;
        _approve(
            address(this),
            _feeDistributor,
            0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF
        );
        IUniswapV2Pair pair = IUniswapV2Pair(tokenUniswapPair);
        pair.approve(
            _feeDistributor,
            0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF
        );
    }

    address public override feeDistributor;

    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal virtual {
        require(sender != address(0), "ERC20: transfer from the zero address");
        require(recipient != address(0), "ERC20: transfer to the zero address");

        _beforeTokenTransfer(sender, recipient, amount);

        _balances[sender] = _balances[sender].sub(
            amount,
            "ERC20: transfer amount exceeds balance"
        );

        (
            uint256 transferToAmount,
            uint256 transferToFeeDistributorAmount
        ) = IFeeApprover(transferCheckerAddress).calculateAmountsAfterFee(
            sender,
            recipient,
            amount
        );
        console.log("Sender is :", sender, "Recipent is :", recipient);
        console.log("amount is ", amount);

        require(
            transferToAmount.add(transferToFeeDistributorAmount) == amount,
            "Math broke, does gravity still work?"
        );

        _balances[recipient] = _balances[recipient].add(transferToAmount);
        emit Transfer(sender, recipient, transferToAmount);

        //transferToFeeDistributorAmount is total rewards fees received for genesis pool (this contract) and farming pool
        if (
            transferToFeeDistributorAmount > 0 && feeDistributor != address(0)
        ) {
            _balances[feeDistributor] = _balances[feeDistributor].add(
                transferToFeeDistributorAmount
            );
            emit Transfer(
                sender,
                feeDistributor,
                transferToFeeDistributorAmount
            );
            INerdVault(feeDistributor).updatePendingRewards();
        }
    }

    function _mint(address account, uint256 amount) internal virtual {
        require(account != address(0), "ERC20: mint to the zero address");

        _beforeTokenTransfer(address(0), account, amount);

        _totalSupply = _totalSupply.add(amount);
        _balances[account] = _balances[account].add(amount);
        emit Transfer(address(0), account, amount);
    }

    function _burn(address account, uint256 amount) internal virtual {
        require(account != address(0), "ERC20: burn from the zero address");

        _beforeTokenTransfer(account, address(0), amount);

        _balances[account] = _balances[account].sub(
            amount,
            "ERC20: burn amount exceeds balance"
        );
        _totalSupply = _totalSupply.sub(amount);
        emit Transfer(account, address(0), amount);
    }

    function _approve(
        address owner,
        address spender,
        uint256 amount
    ) internal virtual {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    function _setupDecimals(uint8 decimals_) internal {
        _decimals = decimals_;
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual {}
}
