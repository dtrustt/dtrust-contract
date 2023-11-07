// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

// Import the ERC-20 interface
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

contract DTRUST is ReentrancyGuard{
    using SafeMath for uint256;
    address settlor;
    address factoryAddress;
    address[] trustees;
    address[] beneficiaries;
    address[] tokens;
    string name;
    bool public isRevoked = false;
    
    mapping(address => bool) trusteesLookup;
    mapping(address => bool) beneficiariesLookup;
    mapping(address => bool) public revokeAddressLookup;
    mapping(address => bool) tokenLookup;

    uint256 etherBalance = 0;
    uint256 public startFeeTime;
    uint256 public dateCreated;

    // Event to log the payouts
    event Paid(address indexed token, address indexed beneficiary, uint256 amount);
    event Revoked();
    event RemoveRevokableAddress(address indexed revokableAddress);
    event ReceivedEther(address indexed sender, uint256 amount);
    event DepositedEther(address indexed sender, uint256 amount);

    modifier isTrustee() {
        require(trusteesLookup[msg.sender] == true, "Only a trustee can perform this action");
        _;
    }

    modifier isActive {
        require(!isRevoked, "The contract has been revoked");
        _;
    }

    constructor(
        string memory _name,
        address _settlor,
        address _factoryAddress,
        address[] memory _trustees,
        address[] memory _beneficiaries,
        address[] memory _canRevokeAddresses
    ) {
        name = _name;
        settlor = _settlor;
        factoryAddress = _factoryAddress;
        addTrsutees(_trustees);
        addBeneficiaries(_beneficiaries);
        addRevokableAddresses(_canRevokeAddresses);
        dateCreated = block.timestamp;
        startFeeTime = block.timestamp;
    }

    receive() external payable {
        etherBalance += msg.value;
        emit DepositedEther(msg.sender, msg.value);
    }

    function addBeneficiaries(address[] memory _beneficiaries) internal {
        for (uint i = 0; i < _beneficiaries.length; i++) {
            beneficiariesLookup[_beneficiaries[i]] = true;
            beneficiaries.push(_beneficiaries[i]);
        }
    }

    function addRevokableAddresses(address[] memory _canRevokeAddresses) internal {
        for(uint i = 0; i < _canRevokeAddresses.length; i++) {
            require(trusteesLookup[_canRevokeAddresses[i]] == true || _canRevokeAddresses[i] == settlor, "Address must be a trustee or the settlor");
            revokeAddressLookup[_canRevokeAddresses[i]] = true;
        }
    }

    function addTrsutees(address[] memory _trustees) internal {
        for (uint i = 0; i < _trustees.length; i++) {
            trusteesLookup[_trustees[i]] = true;
            trustees.push(_trustees[i]);
        }
    }

    function depositEth() external payable isActive { 
        require(msg.value > 0, "Deposit amount should be greater than 0");
        etherBalance += msg.value;
        emit DepositedEther(msg.sender, msg.value);
    }

    function depositToken(address token, uint256 amount) external isActive { 
        // Check that the contract is approved to move the amount of tokens
        uint256 allowedAmount = IERC20(token).allowance(msg.sender, address(this));
        require(amount > 0, "Enter an amount greater then 0");
        require(allowedAmount >= amount, "Contract not approved to move this amount of tokens");
        
        if (tokenLookup[token] == false) {
            tokenLookup[token] = true;
            tokens.push(token);
        }

        // Update the token balance in the mapping
        IERC20(token).transferFrom(msg.sender, address(this), amount);
    }

    function payout(
        address _token,
        uint256 _amount,
        address _beneficiary
    ) external isTrustee isActive nonReentrant {   
        require(beneficiariesLookup[_beneficiary] == true, "Beneficiary provided is not a beneficiary of this contract");
        require(IERC20(_token).balanceOf(address(this)) >= _amount, "Not enough balance of the token" );
        require(IERC20(_token).transfer(_beneficiary, _amount), "Token transfer failed");
        // Perform the payouts
        emit Paid(_token, _beneficiary, _amount);
    }

    function revokeContract() external isActive nonReentrant {
        require(revokeAddressLookup[msg.sender] == true, "You do not have permission to revoke");
        payoutAll(tokens);
        isRevoked = true;
        emit Revoked();
    }

    function payoutEth(uint256 _ethAmount,  address _beneficiary) public isTrustee isActive nonReentrant {
        require(beneficiariesLookup[_beneficiary] == true, "Beneficiary provided is not a beneficiary of this contract");
        require(_ethAmount > 0, "Enter Eth amount > 0");
        require(address(this).balance >= _ethAmount, "Not enough Ether to payout");
        address payable user = payable(_beneficiary);
        user.transfer(_ethAmount);
        etherBalance -= _ethAmount;
        emit Paid(address(this), _beneficiary, _ethAmount);
    }

    function payoutRemaining(address[] memory _tokens) external isTrustee nonReentrant {
        require(isRevoked, "The payout must be revoked, before the remaining balance can be paid out");
        payoutAll(_tokens);
    }

    function payoutAll(address[] memory _tokens) internal {
        if(address(this).balance > 0){
            address payable user = payable(settlor);
            user.transfer(address(this).balance);
            etherBalance -= address(this).balance;
            emit Paid(address(this), settlor, address(this).balance);
        }

        for (uint256 i = 0; i < _tokens.length; i++) {
            address token = _tokens[i];
            uint256 amount = IERC20(token).balanceOf(address(this));
            
            if(amount > 0){
                require(IERC20(token).transfer(settlor, amount), "Token transfer failed");
                emit Paid(token, settlor, amount);
            }
        }
    }

    function removeRevokableAddress() external isActive {
        require(revokeAddressLookup[msg.sender] == true, "Address is not revokable");
        revokeAddressLookup[msg.sender] = false;
        emit RemoveRevokableAddress(msg.sender);
    }

    function takeAnnualFee(address _bankWallet, uint256 _feePercentage) external isActive nonReentrant {
        require(block.timestamp >= startFeeTime, "Not yet time to collect fee");
        require(msg.sender == factoryAddress, "You must be the control wallet");
        
        uint256 feeFraction = _feePercentage.mul(1e14);

        if(address(this).balance > 0 ){
            uint256 ethFee = address(this).balance.mul(feeFraction).div(1e18);
            payable(_bankWallet).transfer(ethFee);
            etherBalance -= ethFee;
            emit Paid(address(0), _bankWallet, ethFee); // address(0) denotes Ether
        }
        
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            uint256 tokenBalance = IERC20(token).balanceOf(address(this));
            if(tokenBalance > 0 ){
                uint256 tokenFee = tokenBalance.mul(feeFraction).div(1e18);
                require(IERC20(token).transfer(_bankWallet, tokenFee), "Token transfer failed");
                emit Paid(token, _bankWallet, tokenFee);
            }
        }

        // Update the startFeeTime for the next year
        startFeeTime += 365 days;
    }


    function getTrustInfo() isActive public view returns (
        string memory,
        address, 
        address[] memory, 
        address[] memory,
        uint256,
        uint256,
        bool
    ) {
        return (name, settlor, trustees, beneficiaries, dateCreated, startFeeTime, isRevoked);
    }
}
