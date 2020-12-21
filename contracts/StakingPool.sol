pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "./INerdBaseToken.sol";
import "./IFeeApprover.sol";
import "./INoFeeSimple.sol";

// Nerd Vault distributes fees equally amongst staked pools
// Have fun reading it. Hopefully it's bug-free. God bless.

contract TimeLockNerdPool {
    using SafeMath for uint256;
    using Address for address;

    uint256 public constant NERD_LOCKED_PERIOD_DAYS = 14; //10 weeks,
    uint256 public constant NERD_RELEASE_TRUNK = 1 days; //releasable every week,

    // Info of each user.
    struct UserInfo {
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
        uint256 accNerdPerShare; // Accumulated NERDs per share, times 1e18. See below.
        uint256 lockedPeriod; // liquidity locked period
        bool emergencyWithdrawable;
        uint256 rewardsInThisEpoch;
        uint256 cumulativeRewardsSinceStart;
        uint256 startBlock;
        // For easy graphing historical epoch rewards
        mapping(uint256 => uint256) epochRewards;
        uint256 epochCalculationStartBlock;
        uint256 totalDeposit;
    }

    // Info of each pool.
    PoolInfo public poolInfo;
    // Info of each user that stakes  tokens.
    mapping(address => UserInfo) public userInfo;

    // The NERD TOKEN!
    INerdBaseTokenLGE public nerd = INerdBaseTokenLGE(
        0x32C868F6318D6334B2250F323D914Bc2239E4EeE
    );
    address public nerdAddress;

    function getNerdReleaseStart(address _user) public view returns (uint256) {
        return userInfo[_user].depositTime;
    }

    function getRemainingNerd(address _user) public view returns (uint256) {
        return userInfo[_user].amount;
    }

    function getReferenceAmount(address _user) public view returns (uint256) {
        return userInfo[_user].referenceAmount;
    }

    function computeReleasableNerd(address _addr)
        public
        view
        returns (uint256)
    {
        uint256 nerdReleaseStart = getNerdReleaseStart(_addr);
        if (block.timestamp < nerdReleaseStart) {
            return 0;
        }

        uint256 amountNerd = getReferenceAmount(_addr);
        if (amountNerd == 0) return 0;

        uint256 totalReleasableTilNow = 0;

        if (block.timestamp > nerdReleaseStart.add(poolInfo.lockedPeriod)) {
            totalReleasableTilNow = amountNerd;
        } else {
            uint256 daysTilNow = daysSinceNerdReleaseTilNow(_addr);

            totalReleasableTilNow = daysTilNow
                .mul(NERD_RELEASE_TRUNK)
                .mul(amountNerd)
                .div(poolInfo.lockedPeriod);
        }
        if (totalReleasableTilNow > amountNerd) {
            totalReleasableTilNow = amountNerd;
        }
        uint256 alreadyReleased = amountNerd.sub(getRemainingNerd(_addr));
        if (totalReleasableTilNow > alreadyReleased) {
            return totalReleasableTilNow.sub(alreadyReleased);
        }
        return 0;
    }

    function daysSinceNerdReleaseTilNow(address _addr)
        public
        view
        returns (uint256)
    {
        uint256 nerdReleaseStart = getNerdReleaseStart(_addr);
        if (nerdReleaseStart == 0 || block.timestamp < nerdReleaseStart)
            return 0;
        uint256 timeTillNow = block.timestamp.sub(nerdReleaseStart);
        uint256 daysTilNow = timeTillNow.div(NERD_RELEASE_TRUNK);
        daysTilNow = daysTilNow.add(1);
        return daysTilNow;
    }
}

contract StakingPool is OwnableUpgradeSafe, TimeLockNerdPool {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // Dev address.
    address public devaddr;
    address public tentativeDevAddress;

    //// pending rewards awaiting anyone to massUpdate
    uint256 public pendingRewards;

    uint256 public epoch;

    uint256 public constant REWARD_LOCKED_PERIOD = 28 days;
    uint256 public constant REWARD_RELEASE_PERCENTAGE = 50;
    uint256 public contractStartBlock;

    // Sets the dev fee for this contract
    // defaults at 7.24%
    // Note contract owner is meant to be a governance contract allowing NERD governance consensus
    uint16 DEV_FEE;

    uint256 public pending_DEV_rewards;
    uint256 public nerdBalance;
    uint256 public pendingDeposit;

    // Returns fees generated since start of this contract
    function averageFeesPerBlockSinceStart()
        external
        view
        returns (uint256 averagePerBlock)
    {
        averagePerBlock = poolInfo
            .cumulativeRewardsSinceStart
            .add(poolInfo.rewardsInThisEpoch)
            .add(pendingNerdForPool())
            .div(block.number.sub(poolInfo.startBlock));
    }

    // Returns averge fees in this epoch
    function averageFeesPerBlockEpoch()
        external
        view
        returns (uint256 averagePerBlock)
    {
        averagePerBlock = poolInfo
            .rewardsInThisEpoch
            .add(pendingNerdForPool())
            .div(block.number.sub(poolInfo.epochCalculationStartBlock));
    }

    function getEpochReward(uint256 _epoch) public view returns (uint256) {
        return poolInfo.epochRewards[_epoch];
    }

    function nerdDeposit() public view returns (uint256) {
        return poolInfo.totalDeposit.add(pendingDeposit);
    }

    //Starts a new calculation epoch
    // Because averge since start will not be accurate
    function startNewEpoch() public {
        require(
            poolInfo.epochCalculationStartBlock + 50000 < block.number,
            "New epoch not ready yet"
        ); // About a week
        poolInfo.epochRewards[epoch] = poolInfo.rewardsInThisEpoch;
        poolInfo.cumulativeRewardsSinceStart = poolInfo
            .cumulativeRewardsSinceStart
            .add(poolInfo.rewardsInThisEpoch);
        poolInfo.rewardsInThisEpoch = 0;
        poolInfo.epochCalculationStartBlock = block.number;
        ++epoch;
    }

    event Deposit(address indexed user, uint256 amount);
    event Restake(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 amount);
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );

    function initialize() public initializer {
        OwnableUpgradeSafe.__Ownable_init();
        nerd = INerdBaseTokenLGE(0x32C868F6318D6334B2250F323D914Bc2239E4EeE);
        require(
            INoFeeSimple(nerd.transferCheckerAddress()).noFeeList(
                address(this)
            ),
            "!Staking pool should not have fee"
        );
        poolInfo.lockedPeriod = NERD_LOCKED_PERIOD_DAYS.mul(NERD_RELEASE_TRUNK);
        DEV_FEE = 724;
        devaddr = nerd.devFundAddress();
        tentativeDevAddress = address(0);
        contractStartBlock = block.number;

        poolInfo.emergencyWithdrawable = false;
        poolInfo.accNerdPerShare = 0;
        poolInfo.rewardsInThisEpoch = 0;
        poolInfo.cumulativeRewardsSinceStart = 0;
        poolInfo.startBlock = block.number;
        poolInfo.epochCalculationStartBlock = block.number;
        poolInfo.totalDeposit = 0;
    }

    function isMultipleOfWeek(uint256 _period) public pure returns (bool) {
        uint256 numWeeks = _period.div(NERD_RELEASE_TRUNK);
        return (_period == numWeeks.mul(NERD_RELEASE_TRUNK));
    }

    function getDepositTime(address _addr) public view returns (uint256) {
        return userInfo[_addr].depositTime;
    }

    function setEmergencyWithdrawable(bool _withdrawable) public onlyOwner {
        poolInfo.emergencyWithdrawable = _withdrawable;
    }

    function setDevFee(uint16 _DEV_FEE) public onlyOwner {
        require(_DEV_FEE <= 1000, "Dev fee clamped at 10%");
        DEV_FEE = _DEV_FEE;
    }

    function pendingNerdForPool() public view returns (uint256) {
        uint256 tokenSupply = poolInfo.totalDeposit;

        if (tokenSupply == 0) return 0;

        uint256 nerdRewardWhole = pendingRewards;
        uint256 nerdRewardFee = nerdRewardWhole.mul(DEV_FEE).div(10000);
        return nerdRewardWhole.sub(nerdRewardFee);
    }

    function computeDepositAmount(
        address _sender,
        address _recipient,
        uint256 _amount
    ) internal returns (uint256) {
        (uint256 _receiveAmount, ) = IFeeApprover(nerd.transferCheckerAddress())
            .calculateAmountsAfterFee(_sender, _recipient, _amount);
        return _receiveAmount;
    }

    // View function to see pending NERDs on frontend.
    function pendingNerd(address _user) public view returns (uint256) {
        UserInfo storage user = userInfo[_user];
        uint256 accNerdPerShare = poolInfo.accNerdPerShare;
        uint256 amount = user.amount;

        uint256 tokenSupply = poolInfo.totalDeposit;

        if (tokenSupply == 0) return 0;

        uint256 nerdRewardFee = pendingRewards.mul(DEV_FEE).div(10000);
        uint256 nerdRewardToDistribute = pendingRewards.sub(nerdRewardFee);
        uint256 inc = nerdRewardToDistribute.mul(1e18).div(tokenSupply);
        accNerdPerShare = accNerdPerShare.add(inc);

        return amount.mul(accNerdPerShare).div(1e18).sub(user.rewardDebt);
    }

    function getLockedReward(address _user) public view returns (uint256) {
        return userInfo[_user].rewardLocked;
    }

    // Update reward vairables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        uint256 allRewards = updatePool();
        pendingRewards = pendingRewards.sub(allRewards);
    }

    // ----
    // Function that adds pending rewards, called by the NERD token.
    // ----
    function updatePendingRewards() public {
        uint256 newRewards = nerd.balanceOf(address(this)).sub(nerdBalance).sub(
            nerdDeposit()
        );

        if (newRewards > 0) {
            nerdBalance = nerd.balanceOf(address(this)).sub(nerdDeposit()); // If there is no change the balance didn't change
            pendingRewards = pendingRewards.add(newRewards);
        }
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool() internal returns (uint256 nerdRewardWhole) {
        uint256 tokenSupply = poolInfo.totalDeposit;
        if (tokenSupply == 0) {
            // avoids division by 0 errors
            return 0;
        }
        nerdRewardWhole = pendingRewards;

        uint256 nerdRewardFee = nerdRewardWhole.mul(DEV_FEE).div(10000);
        uint256 nerdRewardToDistribute = nerdRewardWhole.sub(nerdRewardFee);

        uint256 inc = nerdRewardToDistribute.mul(1e18).div(tokenSupply);
        pending_DEV_rewards = pending_DEV_rewards.add(nerdRewardFee);

        poolInfo.accNerdPerShare = poolInfo.accNerdPerShare.add(inc);
        poolInfo.rewardsInThisEpoch = poolInfo.rewardsInThisEpoch.add(
            nerdRewardToDistribute
        );
    }

    function withdrawNerd() public {
        withdraw(0);
    }

    function claimAndRestake() public {
        UserInfo storage user = userInfo[msg.sender];
        require(user.amount > 0);
        massUpdatePools();

        if (user.releaseTime == 0) {
            user.releaseTime = block.timestamp.add(REWARD_LOCKED_PERIOD);
        }
        uint256 _rewards = 0;
        if (block.timestamp > user.releaseTime) {
            //compute withdrawnable amount
            uint256 lockedAmount = user.rewardLocked;
            user.rewardLocked = 0;
            user.releaseTime = block.timestamp.add(REWARD_LOCKED_PERIOD);
            _rewards = _rewards.add(lockedAmount);
        }

        uint256 pending = pendingNerd(msg.sender);
        uint256 paid = pending.mul(REWARD_RELEASE_PERCENTAGE).div(100);
        uint256 _lockedReward = pending.sub(paid);
        if (_lockedReward > 0) {
            user.rewardLocked = user.rewardLocked.add(_lockedReward);
        }

        _rewards = _rewards.add(paid);

        uint256 lockedPeriod = poolInfo.lockedPeriod;
        uint256 tobeReleased = computeReleasableNerd(msg.sender);
        uint256 amountAfterDeposit = user.amount.add(_rewards);
        uint256 diffTime = tobeReleased.mul(lockedPeriod).div(
            amountAfterDeposit
        );
        user.depositTime = block.timestamp.sub(diffTime.div(2));
        //reset referenceAmount to start a new lock-release period
        user.referenceAmount = amountAfterDeposit;

        user.amount = user.amount.add(_rewards);
        user.rewardDebt = user.amount.mul(poolInfo.accNerdPerShare).div(1e18);
        poolInfo.totalDeposit = poolInfo.totalDeposit.add(_rewards);
        emit Restake(msg.sender, _rewards);
    }

    // Deposit  tokens to NerdVault for NERD allocation.
    function deposit(uint256 _originAmount) public {
        UserInfo storage user = userInfo[msg.sender];

        massUpdatePools();

        // Transfer pending tokens
        // to user
        updateAndPayOutPending(msg.sender);

        pendingDeposit = computeDepositAmount(
            msg.sender,
            address(this),
            _originAmount
        );
        uint256 _actualDepositReceive = pendingDeposit;
        //Transfer in the amounts from user
        // save gas
        if (_actualDepositReceive > 0) {
            nerd.transferFrom(
                address(msg.sender),
                address(this),
                _originAmount
            );
            pendingDeposit = 0;
            updateDepositTime(msg.sender, _actualDepositReceive);
            user.amount = user.amount.add(_actualDepositReceive);
        }
        //massUpdatePools();
        user.rewardDebt = user.amount.mul(poolInfo.accNerdPerShare).div(1e18);
        poolInfo.totalDeposit = poolInfo.totalDeposit.add(
            _actualDepositReceive
        );
        emit Deposit(msg.sender, _actualDepositReceive);
    }

    function updateDepositTime(address _addr, uint256 _depositAmount) internal {
        UserInfo storage user = userInfo[_addr];
        if (user.amount == 0) {
            user.depositTime = block.timestamp;
            user.referenceAmount = _depositAmount;
        } else {
            uint256 lockedPeriod = poolInfo.lockedPeriod;
            uint256 tobeReleased = computeReleasableNerd(_addr);
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
    function depositFor(address _depositFor, uint256 _originAmount) public {
        // requires no allowances
        UserInfo storage user = userInfo[_depositFor];

        massUpdatePools();

        // Transfer pending tokens
        // to user
        updateAndPayOutPending(_depositFor); // Update the balances of person that amount is being deposited for

        pendingDeposit = computeDepositAmount(
            msg.sender,
            address(this),
            _originAmount
        );
        uint256 _actualDepositReceive = pendingDeposit;
        if (_actualDepositReceive > 0) {
            nerd.transferFrom(
                address(msg.sender),
                address(this),
                _originAmount
            );
            pendingDeposit = 0;
            updateDepositTime(_depositFor, _actualDepositReceive);
            user.amount = user.amount.add(_actualDepositReceive); // This is depositedFor address
        }

        user.rewardDebt = user.amount.mul(poolInfo.accNerdPerShare).div(1e18); /// This is deposited for address
        poolInfo.totalDeposit = poolInfo.totalDeposit.add(
            _actualDepositReceive
        );
        emit Deposit(_depositFor, _actualDepositReceive);
    }

    function quitPool() public {
        require(
            block.timestamp > getNerdReleaseStart(msg.sender),
            "cannot withdraw all lp tokens before"
        );

        uint256 withdrawnableAmount = computeReleasableNerd(msg.sender);
        withdraw(withdrawnableAmount);
    }

    // Withdraw  tokens from NerdVault.
    function withdraw(uint256 _amount) public {
        _withdraw(_amount, msg.sender, msg.sender);
    }

    // Low level withdraw function
    function _withdraw(
        uint256 _amount,
        address from,
        address to
    ) internal {
        //require(pool.withdrawable, "Withdrawing from this pool is disabled");
        UserInfo storage user = userInfo[from];
        require(computeReleasableNerd(from) >= _amount, "withdraw: not good");

        massUpdatePools();
        updateAndPayOutPending(from); // Update balances of from this is not withdrawal but claiming NERD farmed

        if (_amount > 0) {
            user.amount = user.amount.sub(_amount);
            poolInfo.totalDeposit = poolInfo.totalDeposit.sub(_amount);
            safeNerdTransfer(address(to), _amount);
        }
        user.rewardDebt = user.amount.mul(poolInfo.accNerdPerShare).div(1e18);

        emit Withdraw(to, _amount);
    }

    function updateAndPayOutPending(address from) internal {
        UserInfo storage user = userInfo[from];
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

        uint256 pending = pendingNerd(from);
        uint256 paid = pending.mul(REWARD_RELEASE_PERCENTAGE).div(100);
        uint256 _lockedReward = pending.sub(paid);
        if (_lockedReward > 0) {
            user.rewardLocked = user.rewardLocked.add(_lockedReward);
        }

        if (paid > 0) {
            safeNerdTransfer(from, paid);
        }
    }

    function emergencyWithdraw() public {
        require(
            poolInfo.emergencyWithdrawable,
            "Withdrawing from this pool is disabled"
        );
        UserInfo storage user = userInfo[msg.sender];
        poolInfo.totalDeposit = poolInfo.totalDeposit.sub(user.amount);
        uint256 withdrawnAmount = user.amount;
        if (withdrawnAmount > nerd.balanceOf(address(this))) {
            withdrawnAmount = nerd.balanceOf(address(this));
        }
        safeNerdTransfer(address(msg.sender), withdrawnAmount);
        emit EmergencyWithdraw(msg.sender, withdrawnAmount);
        user.amount = 0;
        user.rewardDebt = 0;
    }

    function safeNerdTransfer(address _to, uint256 _amount) internal {
        uint256 nerdBal = nerd.balanceOf(address(this));

        if (_amount > nerdBal) {
            nerd.transfer(_to, nerdBal);
            nerdBalance = nerd.balanceOf(address(this)).sub(nerdDeposit());
        } else {
            nerd.transfer(_to, _amount);
            nerdBalance = nerd.balanceOf(address(this)).sub(nerdDeposit());
        }
        transferDevFee();
    }

    function transferDevFee() public {
        if (pending_DEV_rewards == 0) return;

        uint256 nerdBal = nerd.balanceOf(address(this));
        if (pending_DEV_rewards > nerdBal) {
            nerd.transfer(devaddr, nerdBal);
            nerdBalance = nerd.balanceOf(address(this)).sub(nerdDeposit());
        } else {
            nerd.transfer(devaddr, pending_DEV_rewards);
            nerdBalance = nerd.balanceOf(address(this)).sub(nerdDeposit());
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
}
