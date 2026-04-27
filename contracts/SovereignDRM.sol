// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract SovereignDRM {
    uint256 public constant PLATFORM_FEE_BPS = 100;
    uint256 public constant BPS_DENOMINATOR = 10_000;

    address public immutable treasury;
    uint256 public nextContentId;

    struct Content {
        uint256 id;
        address payable creator;
        string ipfsCid;
        uint256 priceWei;
        bool listed;
    }

    mapping(uint256 => Content) public contentById;
    mapping(uint256 => mapping(address => bool)) public hasPurchased;

    event ContentListed(uint256 indexed contentId, address indexed creator, string ipfsCid, uint256 priceWei);
    event ContentPurchased(uint256 indexed contentId, address indexed buyer, uint256 paidWei);
    event FundsDistributed(uint256 indexed contentId, address indexed creator, uint256 creatorShare, uint256 treasuryShare);

    error InvalidTreasury();
    error InvalidPrice();
    error InvalidCid();
    error ContentNotFound();
    error IncorrectPayment();
    error AlreadyPurchased();

    constructor(address treasuryAddress) {
        if (treasuryAddress == address(0)) revert InvalidTreasury();
        treasury = treasuryAddress;
    }

    function listContent(string calldata ipfsCid, uint256 priceWei) external returns (uint256 contentId) {
        if (bytes(ipfsCid).length == 0) revert InvalidCid();
        if (priceWei == 0) revert InvalidPrice();

        contentId = ++nextContentId;

        contentById[contentId] = Content({
            id: contentId,
            creator: payable(msg.sender),
            ipfsCid: ipfsCid,
            priceWei: priceWei,
            listed: true
        });

        emit ContentListed(contentId, msg.sender, ipfsCid, priceWei);
    }

    function purchaseContent(uint256 contentId) external payable {
        Content memory item = contentById[contentId];

        if (!item.listed) revert ContentNotFound();
        if (hasPurchased[contentId][msg.sender]) revert AlreadyPurchased();
        if (msg.value != item.priceWei) revert IncorrectPayment();

        hasPurchased[contentId][msg.sender] = true;

        distributeFunds(contentId, item.creator, item.priceWei);

        emit ContentPurchased(contentId, msg.sender, msg.value);
    }

    function distributeFunds(uint256 contentId, address payable creator, uint256 amountWei) internal {
        uint256 treasuryShare = (amountWei * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 creatorShare = amountWei - treasuryShare;

        creator.transfer(creatorShare);
        payable(treasury).transfer(treasuryShare);

        emit FundsDistributed(contentId, creator, creatorShare, treasuryShare);
    }
}
