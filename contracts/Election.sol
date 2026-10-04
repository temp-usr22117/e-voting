// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract Election is Pausable, ReentrancyGuard {
    address public owner;

    struct Candidate {
        uint id;
        string name;
        uint voteCount;
    }

    uint public candidatesCount;
    mapping(uint => Candidate) public candidates;

    mapping(address => bool) public registered;
    mapping(address => uint) public lastVotedElectionId;
    mapping(address => uint) public votes; // candidateId
    mapping(address => bytes32) public voteHashes; // hash of encrypted vote stored on IPFS

    // Voting period
    uint public votingStart;
    uint public votingEnd;
    bool public votingPeriodSet;

    // Election lifecycle
    uint public currentElectionId;
    bool public electionFinalized;
    uint public totalVotesCurrentElection;

    event VoterRegistered(address indexed voter);
    event CandidateAdded(uint indexed id, string name);
    event VoteCast(address indexed voter, uint indexed candidateId, bytes32 voteHash);
    event VotingPeriodSet(uint startTime, uint endTime);
    event ElectionFinalized(uint indexed electionId, uint finalizedAt, uint totalVotes);
    event ElectionReset(uint indexed previousElectionId, uint indexed newElectionId);
    event EmergencyPaused(address indexed by);
    event EmergencyUnpaused(address indexed by);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    modifier onlyRegistered() {
        require(registered[msg.sender], "not registered");
        _;
    }

    modifier duringVotingPeriod() {
        require(votingPeriodSet, "voting period not set");
        require(block.timestamp >= votingStart, "voting not started");
        require(block.timestamp <= votingEnd, "voting ended");
        _;
    }

    constructor() {
        owner = msg.sender;
        currentElectionId = 1;
    }

    // Set voting period - can be changed before voting starts or after it ends
    function setVotingPeriod(uint _start, uint _end) public onlyOwner {
        require(!electionFinalized, "reset required before new period");
        require(_start < _end, "invalid period");
        require(_start >= block.timestamp, "start must be in future");
        
        // Allow changes only if:
        // 1. No period set yet, OR
        // 2. Before current period starts, OR
        // 3. After current period ends
        if (votingPeriodSet) {
            bool beforeStart = block.timestamp < votingStart;
            bool afterEnd = block.timestamp > votingEnd;
            require(beforeStart || afterEnd, "cannot change during active voting");
        }
        
        votingStart = _start;
        votingEnd = _end;
        votingPeriodSet = true;
        
        emit VotingPeriodSet(_start, _end);
    }
    
    // Cancel voting period (can only cancel before voting starts)
    function cancelVotingPeriod() public onlyOwner {
        require(!electionFinalized, "cannot cancel finalized election");
        require(votingPeriodSet, "no period to cancel");
        require(block.timestamp < votingStart, "cannot cancel during/after voting");
        
        votingPeriodSet = false;
        votingStart = 0;
        votingEnd = 0;
        
        emit VotingPeriodSet(0, 0);
    }

    function addCandidate(string memory name) public onlyOwner whenNotPaused {
        require(!electionFinalized, "cannot add candidate after finalize");
        require(bytes(name).length > 0, "name cannot be empty");
        require(bytes(name).length <= 100, "name too long");
        // Prevent addresses from being used as candidate names
        require(bytes(name).length < 42 || bytes(name)[0] != '0' || bytes(name)[1] != 'x', "invalid name format");
        
        // Can add candidates if:
        // 1. No voting period set yet, OR
        // 2. Before voting starts, OR
        // 3. After voting ends (for next election)
        if (votingPeriodSet) {
            bool beforeStart = block.timestamp < votingStart;
            bool afterEnd = block.timestamp > votingEnd;
            require(beforeStart || afterEnd, "cannot add candidates during active voting");
        }
        
        candidatesCount++;
        candidates[candidatesCount] = Candidate(candidatesCount, name, 0);
        emit CandidateAdded(candidatesCount, name);
    }

    function registerVoter(address _voter) public onlyOwner whenNotPaused {
        require(!electionFinalized, "cannot register after finalize");
        require(_voter != address(0), "invalid address");
        require(_voter != owner, "owner cannot vote");
        require(!registered[_voter], "already registered");
        
        registered[_voter] = true;
        emit VoterRegistered(_voter);
    }

    // Emergency pause/unpause
    function pause() public onlyOwner {
        _pause();
        emit EmergencyPaused(msg.sender);
    }

    function unpause() public onlyOwner {
        _unpause();
        emit EmergencyUnpaused(msg.sender);
    }

    function hasVoted(address _voter) public view returns (bool) {
        return lastVotedElectionId[_voter] == currentElectionId;
    }

    // candidateId must be valid and voter must be registered
    // voteHash should be the SHA-256 (or keccak) hash of the encrypted vote stored off-chain (IPFS)
    function castVote(uint candidateId, bytes32 voteHash) public onlyRegistered duringVotingPeriod whenNotPaused nonReentrant {
        require(!electionFinalized, "election finalized");
        require(candidateId > 0 && candidateId <= candidatesCount, "invalid candidate");
        require(voteHash != bytes32(0), "invalid vote hash");
        require(lastVotedElectionId[msg.sender] != currentElectionId, "already voted");

        lastVotedElectionId[msg.sender] = currentElectionId;
        votes[msg.sender] = candidateId;
        voteHashes[msg.sender] = voteHash;
        candidates[candidateId].voteCount += 1;
        totalVotesCurrentElection += 1;
        emit VoteCast(msg.sender, candidateId, voteHash);
    }

    // Finalize election after voting period has ended.
    // This freezes management actions until resetElection is called.
    function finalizeElection() public onlyOwner {
        require(votingPeriodSet, "voting period not set");
        require(block.timestamp > votingEnd, "voting not ended");
        require(!electionFinalized, "already finalized");

        electionFinalized = true;
        emit ElectionFinalized(currentElectionId, block.timestamp, totalVotesCurrentElection);
    }

    // Reset election for the next round while keeping candidate and voter registries.
    // Vote counts are cleared, voting window is reset, and voters can vote again in the next electionId.
    function resetElection() public onlyOwner {
        require(electionFinalized, "finalize first");

        for (uint i = 1; i <= candidatesCount; i++) {
            candidates[i].voteCount = 0;
        }

        uint previousElectionId = currentElectionId;
        currentElectionId += 1;
        totalVotesCurrentElection = 0;
        votingPeriodSet = false;
        votingStart = 0;
        votingEnd = 0;
        electionFinalized = false;

        emit ElectionReset(previousElectionId, currentElectionId);
        emit VotingPeriodSet(0, 0);
    }

    function getCandidate(uint id) public view returns (uint, string memory, uint) {
        Candidate storage c = candidates[id];
        return (c.id, c.name, c.voteCount);
    }

    // returns arrays of candidate ids and counts
    function tally() public view returns (uint[] memory ids, uint[] memory counts) {
        ids = new uint[](candidatesCount);
        counts = new uint[](candidatesCount);
        for (uint i = 0; i < candidatesCount; i++) {
            ids[i] = i + 1;
            counts[i] = candidates[i + 1].voteCount;
        }
        return (ids, counts);
    }
}
