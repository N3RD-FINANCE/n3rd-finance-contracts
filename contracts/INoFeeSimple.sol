pragma solidity 0.6.12;

interface INoFeeSimple {
    function noFeeList(address) external view returns (bool);
}
