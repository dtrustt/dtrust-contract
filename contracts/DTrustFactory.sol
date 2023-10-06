// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./DTrustV1.sol";

contract DTRUSTFactory {
    address public bankWallet;
    // 10 represents 0.10% fee
    // 100 represents 1% fee
    // 1000 represents 10% fee
    uint256 public bankFee = 10;
    address[] public allDTrusts;
    mapping(address => address[]) public dTrustsByUser;
    mapping(address => mapping(address => bool)) public isUserAddedToDTrust;

    event DTrustCreated(address indexed settlor, address trustAddress);
    event UserAddedToDTrust(address indexed user, address trustAddress);

    constructor(
        address _bankWallet
    ) {
        bankWallet = _bankWallet;
    }

    function createDTRUST(
        string calldata _name,
        address _settlor,
        address[] calldata _trustees,
        address[] calldata _beneficiaries,
        address[] calldata _canRevokeAddresses
    ) external {
        DTRUST newDTRUST = new DTRUST(
            _name,
            _settlor,
            address(this),
            _trustees,
            _beneficiaries,
            _canRevokeAddresses
        );
        allDTrusts.push(address(newDTRUST));
        addUniqueUser(_settlor, newDTRUST);
        addUniqueUsers(_trustees, newDTRUST);
        addUniqueUsers(_beneficiaries, newDTRUST);
        emit DTrustCreated(_settlor, address(newDTRUST));
    }

    function addUniqueUsers(address[] calldata _users, DTRUST newDTRUST) internal {
        for (uint i = 0; i < _users.length; i++) {
            addUniqueUser(_users[i], newDTRUST);
        }
    }

    function addUniqueUser(address _user, DTRUST newDTRUST) internal {
        if (!isUserAddedToDTrust[_user][address(newDTRUST)]) {
            dTrustsByUser[_user].push(address(newDTRUST));
            isUserAddedToDTrust[_user][address(newDTRUST)] = true;
            emit UserAddedToDTrust(_user, address(newDTRUST));
        }
    }

    function getDTrustsByUser(address _user) external view returns (address[] memory) {
        return dTrustsByUser[_user];
    }

    function collectAnnualFeeForTrust(address payable trustAddress) external {
        DTRUST(trustAddress).takeAnnualFee(bankWallet, bankFee);
    }

    function getAllDTrustsCount() external view returns (uint256) {
        return allDTrusts.length;
    }
}
