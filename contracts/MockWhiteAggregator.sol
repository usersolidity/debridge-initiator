// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

contract MockWhiteAggregator {
    struct SubmissionInfo {
        bool confirmed; // whether is confirmed
        uint256 confirmations; // received confirmations count
        mapping(address => bool) hasVerified; // verifier => has already voted
    }

    mapping(bytes32 => SubmissionInfo) public getMintInfo; // mint id => submission info
    mapping(bytes32 => SubmissionInfo) public getBurntInfo; // burnt id => submission info

    event Confirmed(bytes32 submissionId, address operator); // emitted once the submission is confirmed

    /// @dev Confirms the mint request.
    /// @param _mintId Submission identifier.
    function submitMint(bytes32 _mintId) external {
        SubmissionInfo storage mintInfo = getMintInfo[_mintId];
        require(!mintInfo.hasVerified[msg.sender], "submit: submitted already");
        mintInfo.confirmations += 1;
        mintInfo.hasVerified[msg.sender] = true;
        mintInfo.confirmed = true;
        emit Confirmed(_mintId, msg.sender);
    }

    /// @dev Confirms the burnnt request.
    /// @param _burntId Submission identifier.
    function submitBurn(bytes32 _burntId) external {
        SubmissionInfo storage burnInfo = getBurntInfo[_burntId];
        require(!burnInfo.hasVerified[msg.sender], "submit: submitted already");
        burnInfo.confirmations += 1;
        burnInfo.hasVerified[msg.sender] = true;
        burnInfo.confirmed = true;
        emit Confirmed(_burntId, msg.sender);
    }
}
