// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

contract MockWhiteDebridge {
    mapping(address => uint256) public getUserNonce; // submissionId (i.e. hash( debridgeId, amount, receiver, nonce)) => whether is claimed

    event Sent(
        bytes32 sentId,
        bytes32 debridgeId,
        uint256 amount,
        address receiver,
        uint256 nonce,
        uint256 chainIdTo
    ); // emited once the native tokens are locked to be sent to the other chain
    event Burnt(
        bytes32 burntId,
        bytes32 debridgeId,
        uint256 amount,
        address receiver,
        uint256 nonce,
        uint256 chainIdTo
    ); // emited once the wrapped tokens are sent to the contract

    /// @dev Locks asset on the chain and enables minting on the other chain.
    /// @param _debridgeId Asset identifier.
    /// @param _receiver Receiver address.
    /// @param _amount Amount to be transfered (note: the fee can be applyed).
    /// @param _chainIdTo Chain id of the target chain.
    function send(
        bytes32 _debridgeId,
        address _receiver,
        uint256 _amount,
        uint256 _chainIdTo
    ) external {
        uint256 nonce = getUserNonce[_receiver];
        bytes32 sentId = getSubmisionId(_debridgeId, _amount, _receiver, nonce);
        emit Sent(sentId, _debridgeId, _amount, _receiver, nonce, _chainIdTo);
    }

    /// @dev Burns wrapped asset and allowss to claim it on the other chain.
    /// @param _debridgeId Asset identifier.
    /// @param _receiver Receiver address.
    /// @param _amount Amount of the transfered asset (note: the fee can be applyed).
    function burn(
        bytes32 _debridgeId,
        address _receiver,
        uint256 _amount,
        uint256 _chainId
    ) external {
        uint256 nonce = getUserNonce[_receiver];
        bytes32 burntId =
            getSubmisionId(_debridgeId, _amount, _receiver, nonce);
        emit Burnt(burntId, _debridgeId, _amount, _receiver, nonce, _chainId);
        getUserNonce[_receiver]++;
    }

    /// @dev Calculates asset identifier.
    /// @param _tokenAddress Address of the asset on the other chain.
    /// @param _chainId Current chain id.
    function getDebridgeId(uint256 _chainId, address _tokenAddress)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(_chainId, _tokenAddress));
    }

    /// @dev Calculate submission id.
    /// @param _debridgeId Asset identifier.
    /// @param _receiver Receiver address.
    /// @param _amount Amount of the transfered asset (note: the fee can be applyed).
    /// @param _nonce Submission id.
    function getSubmisionId(
        bytes32 _debridgeId,
        uint256 _amount,
        address _receiver,
        uint256 _nonce
    ) public pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(_debridgeId, _amount, _receiver, _nonce)
            );
    }
}
