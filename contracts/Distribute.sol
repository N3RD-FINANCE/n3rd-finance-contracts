pragma solidity 0.6.12;

interface IERC20Simple {
    function transferFrom(
        address _from,
        address _to,
        uint256 amount
    ) external;

    function balanceOf(address addr) external view returns (uint256);
}

contract DistributeNerd {
    IERC20Simple public nerd;
    address public receiver1;
    address public receiver2;

    constructor(
        address _nerd,
        address _receiver1,
        address _receiver2
    ) public {
        nerd = IERC20Simple(_nerd);
        receiver1 = _receiver1;
        receiver2 = _receiver2;
    }

    function distribute(uint256 amount) public {
        nerd.transferFrom(msg.sender, receiver1, amount / 2);
        nerd.transferFrom(msg.sender, receiver2, amount - amount / 2);
    }

    function distributeAll() public {
        uint256 amount = nerd.balanceOf(msg.sender);
        nerd.transferFrom(msg.sender, receiver1, amount / 2);
        nerd.transferFrom(msg.sender, receiver2, amount - amount / 2);
    }
}
