pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "./INerdBaseToken.sol";
import "./uniswapv2/interfaces/IUniswapV2Factory.sol"; // interface factorys
import "./uniswapv2/interfaces/IUniswapV2Router02.sol"; // interface factorys
import "./uniswapv2/interfaces/IUniswapV2Pair.sol";
import "./uniswapv2/interfaces/IWETH.sol";
import "@nomiclabs/buidler/console.sol";

// Nerd Vault distributes fees equally amongst staked pools
// Have fun reading it. Hopefully it's bug-free. God bless.

contract TimeLockLPToken {
    using SafeMath for uint256;
    using Address for address;

    uint256 public constant LP_LOCKED_PERIOD_WEEKS = 10; //10 weeks,
    uint256 public constant LP_RELEASE_TRUNK = 1 weeks; //releasable every week,
    uint256 public constant LP_LOCK_FOREVER_PERCENT = 40; //40%
    uint256 public constant LP_INITIAL_LOCKED_PERIOD = 28 days;
    uint256 public constant LP_ACCUMULATION_FEE = 1; //1/1000
    address public constant ADDRESS_LOCKED_LP_ACCUMULATION = address(0);

    // Info of each user.
    struct UserInfo {
        bool genesisLPClaimed;
        uint256 amount; // How many  tokens the user currently has.
        uint256 referenceAmount; //this amount is used for computing releasable LP amount
        uint256 rewardDebt; // Reward debt. See explanation below.
        uint256 rewardLocked;
        uint256 releaseTime;
        //
        // We do some fancy math here. Basically, any point in time, the amount of NERDs
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accNerdPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws  tokens to a pool. Here's what happens:
        //   1. The pool's `accNerdPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.

        uint256 depositTime; //See explanation below.
        //this is a dynamic value. It changes every time user deposit to the pool
        //1. initial deposit X => deposit time is block time
        //2. deposit more at time deposit2 without amount Y =>
        //  => compute current releasable amount R
        //  => compute diffTime = R*lockedPeriod/(X + Y) => this is the duration users can unlock R with new deposit amount
        //  => updated depositTime = (blocktime - diffTime/2)
    }

    // Info of each pool.
    struct PoolInfo {
        IERC20 token; // Address of  token contract.
        uint256 allocPoint; // How many allocation points assigned to this pool. NERDs to distribute per block.
        uint256 accNerdPerShare; // Accumulated NERDs per share, times 1e18. See below.
        uint256 lockedPeriod; // liquidity locked period
        mapping(address => mapping(address => uint256)) allowance;
        bool emergencyWithdrawable;
        uint256 rewardsInThisEpoch;
        uint256 cumulativeRewardsSinceStart;
        uint256 startBlock;
        // For easy graphing historical epoch rewards
        mapping(uint256 => uint256) epochRewards;
        uint256 epochCalculationStartBlock;
    }

    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Info of each user that stakes  tokens.
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    bool genesisLPClaimed;

    // The NERD TOKEN!
    INerdBaseTokenLGE public nerd;

    event LPTokenClaimed(address dst, uint256 value);

    function getAllocatedLP(address _user) public view returns (uint256) {
        return nerd.getAllocatedLP(_user);
    }

    function getLpReleaseStart(uint256 _pid, address _user)
        public
        view
        returns (uint256)
    {
        if (_pid == 0 && !userInfo[_pid][_user].genesisLPClaimed) {
            return nerd.getLpReleaseStart();
        } else {
            return
                userInfo[_pid][_user].depositTime.add(LP_INITIAL_LOCKED_PERIOD);
        }
    }

    function getRemainingLP(uint256 _pid, address _user)
        public
        view
        returns (uint256)
    {
        if (_pid == 0 && !userInfo[_pid][_user].genesisLPClaimed) {
            return getAllocatedLP(_user);
        } else {
            return userInfo[_pid][_user].amount;
        }
    }

    function getReferenceAmount(uint256 _pid, address _user)
        public
        view
        returns (uint256)
    {
        if (_pid == 0 && !userInfo[_pid][_user].genesisLPClaimed) {
            return getAllocatedLP(_user);
        } else {
            return userInfo[_pid][_user].referenceAmount;
        }
    }

    function computeReleasableLP(uint256 _pid, address _addr)
        public
        view
        returns (uint256)
    {
        uint256 lpReleaseStart = getLpReleaseStart(_pid, _addr);
        if (block.timestamp < lpReleaseStart) {
            return 0;
        }

        uint256 amountLP = getReferenceAmount(_pid, _addr);
        if (amountLP == 0) return 0;

        uint256 totalReleasableTilNow = 0;

        if (block.timestamp > lpReleaseStart.add(poolInfo[_pid].lockedPeriod)) {
            totalReleasableTilNow = amountLP;
        } else {
            uint256 weeksTilNow = weeksSinceLPReleaseTilNow(_pid, _addr);

            totalReleasableTilNow = weeksTilNow
                .mul(LP_RELEASE_TRUNK)
                .mul(amountLP)
                .div(poolInfo[_pid].lockedPeriod);
        }
        if (totalReleasableTilNow > amountLP) {
            totalReleasableTilNow = amountLP;
        }
        uint256 alreadyReleased = amountLP.sub(getRemainingLP(_pid, _addr));
        if (totalReleasableTilNow > alreadyReleased) {
            return totalReleasableTilNow.sub(alreadyReleased);
        }
        return 0;
    }

    function computeLockedLP(uint256 _pid, address _addr)
        public
        view
        returns (uint256)
    {
        return getRemainingLP(_pid, _addr);
    }

    function weeksSinceLPReleaseTilNow(uint256 _pid, address _addr)
        public
        view
        returns (uint256)
    {
        uint256 lpReleaseStart = getLpReleaseStart(_pid, _addr);
        if (lpReleaseStart == 0 || block.timestamp < lpReleaseStart) return 0;
        uint256 timeTillNow = block.timestamp.sub(lpReleaseStart);
        uint256 weeksTilNow = timeTillNow.div(LP_RELEASE_TRUNK);
        weeksTilNow = weeksTilNow.add(1);
        return weeksTilNow;
    }
}

contract NerdVault is OwnableUpgradeSafe, TimeLockLPToken {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // Dev address.
    address public devaddr;
    address public tentativeDevAddress;

    // Total allocation poitns. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint;

    //// pending rewards awaiting anyone to massUpdate
    uint256 public pendingRewards;

    uint256 public epoch;

    uint256 public constant REWARD_LOCKED_PERIOD = 28 days;
    uint256 public constant REWARD_RELEASE_PERCENTAGE = 50;
    uint256 public contractStartBlock;

    uint256 private nerdBalance;

    // Sets the dev fee for this contract
    // defaults at 7.24%
    // Note contract owner is meant to be a governance contract allowing NERD governance consensus
    uint16 DEV_FEE;

    uint256 public pending_DEV_rewards;

    address private _superAdmin;

    IUniswapV2Router02 public uniswapRouterV2;
    IUniswapV2Factory public uniswapFactory;

    // Returns fees generated since start of this contract
    function averageFeesPerBlockSinceStart(uint256 _pid)
        external
        view
        returns (uint256 averagePerBlock)
    {
        averagePerBlock = poolInfo[_pid]
            .cumulativeRewardsSinceStart
            .add(poolInfo[_pid].rewardsInThisEpoch)
            .add(pendingNerdForPool(_pid))
            .div(block.number.sub(poolInfo[_pid].startBlock));
    }

    // Returns averge fees in this epoch
    function averageFeesPerBlockEpoch(uint256 _pid)
        external
        view
        returns (uint256 averagePerBlock)
    {
        averagePerBlock = poolInfo[_pid]
            .rewardsInThisEpoch
            .add(pendingNerdForPool(_pid))
            .div(block.number.sub(poolInfo[_pid].epochCalculationStartBlock));
    }

    function getEpochReward(uint256 _pid, uint256 _epoch)
        public
        view
        returns (uint256)
    {
        return poolInfo[_pid].epochRewards[_epoch];
    }

    //Starts a new calculation epoch
    // Because averge since start will not be accurate
    function startNewEpoch() public {
        for (uint256 _pid = 0; _pid < poolInfo.length; _pid++) {
            require(
                poolInfo[_pid].epochCalculationStartBlock + 50000 <
                    block.number,
                "New epoch not ready yet"
            ); // About a week
            poolInfo[_pid].epochRewards[epoch] = poolInfo[_pid]
                .rewardsInThisEpoch;
            poolInfo[_pid].cumulativeRewardsSinceStart = poolInfo[_pid]
                .cumulativeRewardsSinceStart
                .add(poolInfo[_pid].rewardsInThisEpoch);
            poolInfo[_pid].rewardsInThisEpoch = 0;
            poolInfo[_pid].epochCalculationStartBlock = block.number;
            ++epoch;
        }
    }

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(
        address indexed user,
        uint256 indexed pid,
        uint256 amount
    );
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 _pid,
        uint256 value
    );

    function initialize(INerdBaseTokenLGE _nerd, address superAdmin)
        public
        initializer
    {
        OwnableUpgradeSafe.__Ownable_init();
        DEV_FEE = 724;
        nerd = _nerd;
        devaddr = nerd.devFundAddress();
        tentativeDevAddress = address(0);
        contractStartBlock = block.number;
        _superAdmin = superAdmin;

        require(
            isTokenPairValid(nerd.tokenUniswapPair()),
            "One of the paired tokens must be NERD"
        );

        //add first pool: genesis pool
        add(uint256(1000), IERC20(nerd.tokenUniswapPair()), true);
        uniswapRouterV2 = IUniswapV2Router02(nerd.getUniswapRouterV2());
        uniswapFactory = IUniswapV2Factory(nerd.getUniswapFactory());
    }

    function isTokenPairValid(address _pair) public view returns (bool) {
        IUniswapV2Pair tokenPair = IUniswapV2Pair(_pair);
        return
            tokenPair.token0() == address(nerd) ||
            tokenPair.token1() == address(nerd);
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    function poolToken(uint256 _pid) external view returns (address) {
        return address(poolInfo[_pid].token);
    }

    function isMultipleOfWeek(uint256 _period) public pure returns (bool) {
        uint256 numWeeks = _period.div(LP_RELEASE_TRUNK);
        return (_period == numWeeks.mul(LP_RELEASE_TRUNK));
    }

    // Add a new token pool. Can only be called by the owner.
    // Note contract owner is meant to be a governance contract allowing NERD governance consensus
    function add(
        uint256 _allocPoint,
        IERC20 _token,
        bool _withUpdate
    ) public onlyOwner {
        require(
            isTokenPairValid(address(_token)),
            "One of the paired tokens must be NERD"
        );
        if (_withUpdate) {
            massUpdatePools();
        }

        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            require(poolInfo[pid].token != _token, "Error pool already added");
        }

        totalAllocPoint = totalAllocPoint.add(_allocPoint);

        poolInfo.push(
            PoolInfo({
                token: _token,
                allocPoint: _allocPoint,
                accNerdPerShare: 0,
                lockedPeriod: LP_LOCKED_PERIOD_WEEKS.mul(LP_RELEASE_TRUNK),
                emergencyWithdrawable: false,
                rewardsInThisEpoch: 0,
                cumulativeRewardsSinceStart: 0,
                startBlock: block.number,
                epochCalculationStartBlock: block.number
            })
        );
    }

    function claimLPToken() public {
        if (!genesisLPClaimed) {
            if (nerd.isLPGenerationCompleted()) {
                genesisLPClaimed = true;
                uint256 totalMinted = nerd.getReleasableLPTokensMinted();
                poolInfo[0].token.safeTransferFrom(
                    address(nerd),
                    address(this),
                    totalMinted
                );
            }
        }
    }

    function claimLPTokensToFarmingPool(address _addr) public {
        claimLPToken();
        if (genesisLPClaimed) {
            if (!userInfo[0][_addr].genesisLPClaimed) {
                uint256 allocated = getAllocatedLP(_addr);
                userInfo[0][_addr].genesisLPClaimed = true;
                userInfo[0][_addr].amount = allocated;
                userInfo[0][_addr].referenceAmount = allocated;
                userInfo[0][_addr].depositTime = nerd.getLpReleaseStart().sub(
                    LP_INITIAL_LOCKED_PERIOD
                );
            }
        }
    }

    function getDepositTime(uint256 _pid, address _addr)
        public
        view
        returns (uint256)
    {
        return userInfo[_pid][_addr].depositTime;
    }

    //return value is /1000
    function getPenaltyFactorForEarlyUnlockers(uint256 _pid, address _addr)
        public
        view
        returns (uint256)
    {
        uint256 lpReleaseStart = getLpReleaseStart(_pid, _addr);
        if (lpReleaseStart == 0 || block.timestamp < lpReleaseStart)
            return 1000;
        uint256 weeksTilNow = weeksSinceLPReleaseTilNow(_pid, _addr);
        uint256 numReleaseWeeks = poolInfo[_pid].lockedPeriod.div(
            LP_RELEASE_TRUNK
        ); //10
        if (weeksTilNow >= numReleaseWeeks) return 0;
        uint256 remainingWeeks = numReleaseWeeks.sub(weeksTilNow);
        //week 1: 45/1000 = 4.5%
        //week 2: 40/1000 = 4%
        uint256 ret = remainingWeeks.mul(50000).div(1000).div(numReleaseWeeks);
        return ret > 1000 ? 1000 : ret;
    }

    function computeReleasableLPWithPenalty(uint256 _pid, address _addr)
        public
        view
        returns (uint256 userAmount, uint256 penaltyAmount)
    {
        uint256 releasableWithoutPenalty = computeReleasableLP(_pid, _addr);
        uint256 penalty = getPenaltyFactorForEarlyUnlockers(_pid, _addr);
        penaltyAmount = releasableWithoutPenalty.mul(penalty).div(1000);
        userAmount = releasableWithoutPenalty
            .mul(uint256(1000).sub(penalty))
            .div(1000);
    }

    function removeLiquidity(address _pair, uint256 _lpAmount)
        internal
        returns (uint256)
    {
        IUniswapV2Pair _tokenPair = IUniswapV2Pair(_pair);
        _tokenPair.approve(address(uniswapRouterV2), _lpAmount);
        (uint256 amountA, uint256 amountB) = uniswapRouterV2.removeLiquidity(
            _tokenPair.token0(),
            _tokenPair.token1(),
            _lpAmount,
            0,
            0,
            address(this),
            block.timestamp + 86400
        );
        uint256 otherTokenAmount = _tokenPair.token0() == address(nerd)
            ? amountB
            : amountA;
        return otherTokenAmount;
    }

    function swapTokenForNerd(address _pair, uint256 _tokenAmount) internal {
        //withdraw liquidtity for _actualPenalty
        IUniswapV2Pair _tokenPair = IUniswapV2Pair(_pair);
        address otherTokenAddress = _tokenPair.token0() == address(nerd)
            ? _tokenPair.token1()
            : _tokenPair.token0();
        address[] memory paths = new address[](2);
        paths[0] = otherTokenAddress;
        paths[1] = address(nerd);

        IERC20 otherToken = IERC20(otherTokenAddress);
        otherToken.approve(address(uniswapRouterV2), _tokenAmount);
        uniswapRouterV2.swapExactTokensForTokens(
            _tokenAmount,
            0,
            paths,
            address(this),
            block.timestamp.add(86400)
        );
    }

    // Update the given pool's NERDs allocation point. Can only be called by the owner.
    // Note contract owner is meant to be a governance contract allowing NERD governance consensus

    function set(
        uint256 _pid,
        uint256 _allocPoint,
        bool _withUpdate
    ) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }

        totalAllocPoint = totalAllocPoint.sub(poolInfo[_pid].allocPoint).add(
            _allocPoint
        );
        poolInfo[_pid].allocPoint = _allocPoint;
    }

    // Update the given pool's ability to withdraw tokens
    // Note contract owner is meant to be a governance contract allowing NERD governance consensus
    function setPoolLockPeriod(uint256 _pid, uint256 _lockedPeriod)
        public
        onlyOwner
    {
        require(
            isMultipleOfWeek(_lockedPeriod),
            "Locked period must be a multiple of week"
        );
        poolInfo[_pid].lockedPeriod = _lockedPeriod;
    }

    function setEmergencyWithdrawable(uint256 _pid, bool _withdrawable)
        public
        onlyOwner
    {
        poolInfo[_pid].emergencyWithdrawable = _withdrawable;
    }

    function setDevFee(uint16 _DEV_FEE) public onlyOwner {
        require(_DEV_FEE <= 1000, "Dev fee clamped at 10%");
        DEV_FEE = _DEV_FEE;
    }

    function pendingNerdForPool(uint256 _pid) public view returns (uint256) {
        PoolInfo storage pool = poolInfo[_pid];

        uint256 tokenSupply = pool.token.balanceOf(address(this));
        if (_pid == 0 && !genesisLPClaimed) {
            uint256 totalMinted = nerd.getReleasableLPTokensMinted();
            tokenSupply = tokenSupply.add(totalMinted);
        }

        if (tokenSupply == 0) return 0;

        uint256 nerdRewardWhole = pendingRewards // Multiplies pending rewards by allocation point of this pool and then total allocation
            .mul(pool.allocPoint) // getting the percent of total pending rewards this pool should get
            .div(totalAllocPoint); // we can do this because pools are only mass updated
        uint256 nerdRewardFee = nerdRewardWhole.mul(DEV_FEE).div(10000);
        return nerdRewardWhole.sub(nerdRewardFee);
    }

    // View function to see pending NERDs on frontend.
    function pendingNerd(uint256 _pid, address _user)
        public
        view
        returns (uint256)
    {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accNerdPerShare = pool.accNerdPerShare;
        uint256 amount = user.amount;

        uint256 tokenSupply = pool.token.balanceOf(address(this));
        if (_pid == 0 && !genesisLPClaimed) {
            uint256 totalMinted = nerd.getReleasableLPTokensMinted();
            tokenSupply = tokenSupply.add(totalMinted);
        }

        if (tokenSupply == 0) return 0;

        if (_pid == 0 && !user.genesisLPClaimed) {
            uint256 allocated = getAllocatedLP(_user);
            amount = amount.add(allocated);
        }

        uint256 nerdRewardWhole = pendingRewards // Multiplies pending rewards by allocation point of this pool and then total allocation
            .mul(pool.allocPoint) // getting the percent of total pending rewards this pool should get
            .div(totalAllocPoint); // we can do this because pools are only mass updated
        uint256 nerdRewardFee = nerdRewardWhole.mul(DEV_FEE).div(10000);
        uint256 nerdRewardToDistribute = nerdRewardWhole.sub(nerdRewardFee);
        uint256 inc = nerdRewardToDistribute.mul(1e18).div(tokenSupply);
        accNerdPerShare = accNerdPerShare.add(inc);

        return amount.mul(accNerdPerShare).div(1e18).sub(user.rewardDebt);
    }

    function getLockedReward(uint256 _pid, address _user)
        public
        view
        returns (uint256)
    {
        return userInfo[_pid][_user].rewardLocked;
    }

    // Update reward vairables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        console.log("Mass Updating Pools");
        uint256 length = poolInfo.length;
        uint256 allRewards;
        for (uint256 pid = 0; pid < length; ++pid) {
            allRewards = allRewards.add(updatePool(pid));
        }

        pendingRewards = pendingRewards.sub(allRewards);
    }

    // ----
    // Function that adds pending rewards, called by the NERD token.
    // ----
    function updatePendingRewards() public {
        uint256 newRewards = nerd.balanceOf(address(this)).sub(nerdBalance);

        if (newRewards > 0) {
            nerdBalance = nerd.balanceOf(address(this)); // If there is no change the balance didn't change
            pendingRewards = pendingRewards.add(newRewards);
        }
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid)
        internal
        returns (uint256 nerdRewardWhole)
    {
        PoolInfo storage pool = poolInfo[_pid];

        uint256 tokenSupply = pool.token.balanceOf(address(this));
        if (_pid == 0 && !genesisLPClaimed) {
            uint256 totalMinted = nerd.getReleasableLPTokensMinted();
            tokenSupply = tokenSupply.add(totalMinted);
        }
        if (tokenSupply == 0) {
            // avoids division by 0 errors
            return 0;
        }
        nerdRewardWhole = pendingRewards // Multiplies pending rewards by allocation point of this pool and then total allocation
            .mul(pool.allocPoint) // getting the percent of total pending rewards this pool should get
            .div(totalAllocPoint); // we can do this because pools are only mass updated

        uint256 nerdRewardFee = nerdRewardWhole.mul(DEV_FEE).div(10000);
        uint256 nerdRewardToDistribute = nerdRewardWhole.sub(nerdRewardFee);

        uint256 inc = nerdRewardToDistribute.mul(1e18).div(tokenSupply);
        nerdRewardToDistribute = tokenSupply.mul(inc).div(1e18);
        nerdRewardFee = nerdRewardWhole.sub(nerdRewardToDistribute);
        pending_DEV_rewards = pending_DEV_rewards.add(nerdRewardFee);

        pool.accNerdPerShare = pool.accNerdPerShare.add(inc);
        pool.rewardsInThisEpoch = pool.rewardsInThisEpoch.add(
            nerdRewardToDistribute
        );
    }

    function withdrawNerd(uint256 _pid) public {
        withdraw(_pid, 0);
    }

    // Deposit  tokens to NerdVault for NERD allocation.
    function deposit(uint256 _pid, uint256 _originAmount) public {
        claimLPTokensToFarmingPool(msg.sender);
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        massUpdatePools();

        // Transfer pending tokens
        // to user
        updateAndPayOutPending(_pid, msg.sender);

        uint256 lpAccumulationFee = _originAmount.mul(LP_ACCUMULATION_FEE).div(
            1000
        );
        uint256 _amount = _originAmount.sub(lpAccumulationFee);

        //Transfer in the amounts from user
        // save gas
        if (_amount > 0) {
            pool.token.safeTransferFrom(
                address(msg.sender),
                ADDRESS_LOCKED_LP_ACCUMULATION,
                lpAccumulationFee
            );
            pool.token.safeTransferFrom(
                address(msg.sender),
                address(this),
                _amount
            );
            updateDepositTime(_pid, msg.sender, _amount);
            user.amount = user.amount.add(_amount);
        }

        user.rewardDebt = user.amount.mul(pool.accNerdPerShare).div(1e18);
        emit Deposit(msg.sender, _pid, _amount);
    }

    function updateDepositTime(
        uint256 _pid,
        address _addr,
        uint256 _depositAmount
    ) internal {
        UserInfo storage user = userInfo[_pid][_addr];
        if (user.amount == 0) {
            user.depositTime = block.timestamp;
            user.referenceAmount = _depositAmount;
        } else {
            uint256 lockedPeriod = poolInfo[_pid].lockedPeriod;
            uint256 tobeReleased = computeReleasableLP(_pid, _addr);
            uint256 amountAfterDeposit = user.amount.add(_depositAmount);
            uint256 diffTime = tobeReleased.mul(lockedPeriod).div(
                amountAfterDeposit
            );
            user.depositTime = block.timestamp.sub(diffTime.div(2));
            //reset referenceAmount to start a new lock-release period
            user.referenceAmount = amountAfterDeposit;
        }
    }

    // Test coverage
    // [x] Does user get the deposited amounts?
    // [x] Does user that its deposited for update correcty?
    // [x] Does the depositor get their tokens decreased
    function depositFor(
        address _depositFor,
        uint256 _pid,
        uint256 _originAmount
    ) public {
        claimLPTokensToFarmingPool(_depositFor);
        // requires no allowances
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_depositFor];

        massUpdatePools();

        // Transfer pending tokens
        // to user
        updateAndPayOutPending(_pid, _depositFor); // Update the balances of person that amount is being deposited for
        uint256 lpAccumulationFee = _originAmount.mul(LP_ACCUMULATION_FEE).div(
            1000
        );
        uint256 _amount = _originAmount.sub(lpAccumulationFee);

        if (_amount > 0) {
            pool.token.safeTransferFrom(
                address(msg.sender),
                ADDRESS_LOCKED_LP_ACCUMULATION,
                lpAccumulationFee
            );
            pool.token.safeTransferFrom(
                address(msg.sender),
                address(this),
                _amount
            );
            updateDepositTime(_pid, _depositFor, _amount);
            user.amount = user.amount.add(_amount); // This is depositedFor address
        }

        user.rewardDebt = user.amount.mul(pool.accNerdPerShare).div(1e18); /// This is deposited for address
        emit Deposit(_depositFor, _pid, _amount);
    }

    // Test coverage
    // [x] Does allowance update correctly?
    function setAllowanceForPoolToken(
        address spender,
        uint256 _pid,
        uint256 value
    ) public {
        PoolInfo storage pool = poolInfo[_pid];
        pool.allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, _pid, value);
    }

    function quitPool(uint256 _pid) public {
        require(
            block.timestamp > getLpReleaseStart(_pid, msg.sender),
            "cannot withdraw all lp tokens before"
        );

        (uint256 withdrawnableAmount, ) = computeReleasableLPWithPenalty(
            _pid,
            msg.sender
        );
        withdraw(_pid, withdrawnableAmount);
    }

    // Test coverage
    // [x] Does allowance decrease?
    // [x] Do oyu need allowance
    // [x] Withdraws to correct address
    function withdrawFrom(
        address owner,
        uint256 _pid,
        uint256 _amount
    ) public {
        claimLPTokensToFarmingPool(owner);
        PoolInfo storage pool = poolInfo[_pid];
        require(
            pool.allowance[owner][msg.sender] >= _amount,
            "withdraw: insufficient allowance"
        );
        pool.allowance[owner][msg.sender] = pool.allowance[owner][msg.sender]
            .sub(_amount);
        _withdraw(_pid, _amount, owner, msg.sender);
    }

    // Withdraw  tokens from NerdVault.
    function withdraw(uint256 _pid, uint256 _amount) public {
        claimLPTokensToFarmingPool(msg.sender);
        _withdraw(_pid, _amount, msg.sender, msg.sender);
    }

    // Low level withdraw function
    function _withdraw(
        uint256 _pid,
        uint256 _amount,
        address from,
        address to
    ) internal {
        PoolInfo storage pool = poolInfo[_pid];
        //require(pool.withdrawable, "Withdrawing from this pool is disabled");
        UserInfo storage user = userInfo[_pid][from];
        (
            uint256 withdrawnableAmount,
            uint256 penaltyAmount
        ) = computeReleasableLPWithPenalty(_pid, from);
        require(withdrawnableAmount >= _amount, "withdraw: not good");

        massUpdatePools();
        updateAndPayOutPending(_pid, from); // Update balances of from this is not withdrawal but claiming NERD farmed

        if (_amount > 0) {
            uint256 _actualWithdrawn = _amount;
            uint256 _actualPenalty = _actualWithdrawn.mul(penaltyAmount).div(
                withdrawnableAmount
            );
            user.amount = user.amount.sub(_actualWithdrawn.add(_actualPenalty));

            pool.token.safeTransfer(address(to), _actualWithdrawn);

            if (_actualPenalty > 0) {
                //withdraw liquidtity for _actualPenalty
                uint256 otherTokenAmount = removeLiquidity(
                    address(pool.token),
                    _actualPenalty
                );
                swapTokenForNerd(address(pool.token), otherTokenAmount);

                updatePendingRewards();
            }
        }
        user.rewardDebt = user.amount.mul(pool.accNerdPerShare).div(1e18);

        emit Withdraw(to, _pid, _amount);
    }

    function updateAndPayOutPending(uint256 _pid, address from) internal {
        UserInfo storage user = userInfo[_pid][from];
        if (user.releaseTime == 0) {
            user.releaseTime = block.timestamp.add(REWARD_LOCKED_PERIOD);
        }
        if (block.timestamp > user.releaseTime) {
            //compute withdrawnable amount
            uint256 lockedAmount = user.rewardLocked;
            user.rewardLocked = 0;
            safeNerdTransfer(from, lockedAmount);
            user.releaseTime = block.timestamp.add(REWARD_LOCKED_PERIOD);
        }

        uint256 pending = pendingNerd(_pid, from);
        uint256 paid = pending.mul(REWARD_RELEASE_PERCENTAGE).div(100);
        uint256 _lockedReward = pending.sub(paid);
        if (_lockedReward > 0) {
            user.rewardLocked = user.rewardLocked.add(_lockedReward);
        }

        if (paid > 0) {
            safeNerdTransfer(from, paid);
        }
    }

    // function that lets owner/governance contract
    // approve allowance for any token inside this contract
    // This means all future UNI like airdrops are covered
    // And at the same time allows us to give allowance to strategy contracts.
    // Upcoming cYFI etc vaults strategy contracts will  se this function to manage and farm yield on value locked
    function setStrategyContractOrDistributionContractAllowance(
        address tokenAddress,
        uint256 _amount,
        address contractAddress
    ) public onlySuperAdmin {
        require(
            isContract(contractAddress),
            "Recipent is not a smart contract, BAD"
        );
        require(
            block.number > contractStartBlock.add(95_000),
            "Governance setup grace period not over"
        );
        IERC20(tokenAddress).approve(contractAddress, _amount);
    }

    function isContract(address addr) public view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(addr)
        }
        return size > 0;
    }

    function emergencyWithdraw(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        require(
            pool.emergencyWithdrawable,
            "Withdrawing from this pool is disabled"
        );
        claimLPTokensToFarmingPool(msg.sender);
        UserInfo storage user = userInfo[_pid][msg.sender];
        pool.token.safeTransfer(address(msg.sender), user.amount);
        emit EmergencyWithdraw(msg.sender, _pid, user.amount);
        user.amount = 0;
        user.rewardDebt = 0;
    }

    function safeNerdTransfer(address _to, uint256 _amount) internal {
        uint256 nerdBal = nerd.balanceOf(address(this));

        if (_amount > nerdBal) {
            nerd.transfer(_to, nerdBal);
            nerdBalance = nerd.balanceOf(address(this));
        } else {
            nerd.transfer(_to, _amount);
            nerdBalance = nerd.balanceOf(address(this));
        }
        transferDevFee();
    }

    function transferDevFee() public {
        if (pending_DEV_rewards == 0) return;

        uint256 nerdBal = nerd.balanceOf(address(this));
        if (pending_DEV_rewards > nerdBal) {
            nerd.transfer(devaddr, nerdBal);
            nerdBalance = nerd.balanceOf(address(this));
        } else {
            nerd.transfer(devaddr, pending_DEV_rewards);
            nerdBalance = nerd.balanceOf(address(this));
        }

        pending_DEV_rewards = 0;
    }

    function setDevFeeReciever(address _devaddr) public onlyOwner {
        require(devaddr == msg.sender, "only dev can change");
        tentativeDevAddress = _devaddr;
    }

    function confirmDevAddress() public {
        require(tentativeDevAddress == msg.sender, "not tentativeDevAddress!");
        devaddr = tentativeDevAddress;
        tentativeDevAddress = address(0);
    }

    event SuperAdminTransfered(
        address indexed previousOwner,
        address indexed newOwner
    );

    function superAdmin() public view returns (address) {
        return _superAdmin;
    }

    modifier onlySuperAdmin() {
        require(
            _superAdmin == _msgSender(),
            "Super admin : caller is not super admin."
        );
        _;
    }

    function burnSuperAdmin() public virtual onlySuperAdmin {
        emit SuperAdminTransfered(_superAdmin, address(0));
        _superAdmin = address(0);
    }

    function newSuperAdmin(address newOwner) public virtual onlySuperAdmin {
        require(
            newOwner != address(0),
            "Ownable: new owner is the zero address"
        );
        emit SuperAdminTransfered(_superAdmin, newOwner);
        _superAdmin = newOwner;
    }

    function getLiquidityInfo(uint256 _pid)
        public
        view
        returns (
            uint256 lpSupply,
            uint256 nerdAmount,
            uint256 totalNerdAmount,
            uint256 tokenAmount,
            uint256 totalTokenAmount,
            uint256 lockedLP,
            uint256 totalLockedLP
        )
    {
        IERC20 lpToken = poolInfo[_pid].token;
        IERC20 nerdToken = IERC20(address(nerd));
        IUniswapV2Pair pair = IUniswapV2Pair(address(lpToken));
        address otherTokenAddress = (pair.token0() == address(nerd))
            ? pair.token1()
            : pair.token0();
        IERC20 otherToken = IERC20(otherTokenAddress);

        lpSupply = lpToken.totalSupply();
        if (lpSupply > 0) {
            uint256 lpNerdBalance = nerdToken.balanceOf(address(lpToken));
            uint256 lpOtherBalance = otherToken.balanceOf(address(lpToken));

            lockedLP = lpToken.balanceOf(address(this));
            if (lockedLP == 0 && _pid == 0 && !genesisLPClaimed) {
                lockedLP = nerd.getReleasableLPTokensMinted();
                totalLockedLP = nerd.getTotalLPTokensMinted();
            } else {
                totalLockedLP = lockedLP;
                if (_pid == 0) {
                    totalLockedLP = totalLockedLP.add(
                        nerd.getTotalLPTokensMinted().sub(
                            nerd.getReleasableLPTokensMinted()
                        )
                    );
                }
            }
            nerdAmount = lockedLP.mul(lpNerdBalance).div(lpSupply);
            totalNerdAmount = totalLockedLP.mul(lpNerdBalance).div(lpSupply);

            tokenAmount = lockedLP.mul(lpOtherBalance).div(lpSupply);
            totalTokenAmount = totalLockedLP.mul(lpOtherBalance).div(lpSupply);
        }
    }
}
