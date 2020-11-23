// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IFeeApprover {
    function check(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);

    function setFeeMultiplier(uint256 _feeMultiplier) external;

    function feePercentX100() external view returns (uint256);

    function setTokenUniswapPair(address _tokenUniswapPair) external;

    function setNerdTokenAddress(address _nerdTokenAddress) external;

    function updateTxState() external;

    function calculateAmountsAfterFee(
        address sender,
        address recipient,
        uint256 amount
    )
        external
        returns (uint256 transferToAmount, uint256 transferToFeeBearerAmount);

    function setPaused() external;
}
