pragma solidity 0.6.12;
import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "./INerdVault.sol";
import "./INoFeeSimple.sol";
import "./INerdBaseToken.sol";

interface IUpdateReward {
    function updatePendingRewards() external;
}

contract FeeDistributorProxy is OwnableUpgradeSafe, INerdVault {
    using SafeMath for uint256;
    IUpdateReward public vault;
    IUpdateReward public stakingPool;
    INerdBaseTokenLGE public nerd;
    uint256 public stakingPercentage;

    function initialize(address _pool) public initializer {
        OwnableUpgradeSafe.__Ownable_init();
        stakingPool = IUpdateReward(_pool);

        vault = IUpdateReward(0x47cE2237d7235Ff865E1C74bF3C6d9AF88d1bbfF);
        nerd = INerdBaseTokenLGE(0x32C868F6318D6334B2250F323D914Bc2239E4EeE);
        stakingPercentage = 20;
        require(
            INoFeeSimple(nerd.transferCheckerAddress()).noFeeList(
                address(this)
            ),
            "!Distributor should not have fee"
        );
    }

    function setStakingPercentage(uint256 _staking) external onlyOwner {
        stakingPercentage = _staking;
    }

    function updatePendingRewards() external override {
        uint256 balance = nerd.balanceOf(address(this));
        uint256 stakingRewards = balance.mul(stakingPercentage).div(100);
        uint256 vaultRewards = balance.sub(stakingRewards);

        nerd.transfer(address(vault), vaultRewards);
        vault.updatePendingRewards();

        nerd.transfer(address(stakingPool), stakingRewards);
        stakingPool.updatePendingRewards();
    }

    function depositFor(
        address _depositFor,
        uint256 _pid,
        uint256 _amount
    ) external override {}

    function poolInfo(uint256 _pid)
        external
        override
        view
        returns (
            address,
            uint256,
            uint256,
            uint256,
            bool,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        return (address(0), 0, 0, 0, false, 0, 0, 0, 0);
    }
}
