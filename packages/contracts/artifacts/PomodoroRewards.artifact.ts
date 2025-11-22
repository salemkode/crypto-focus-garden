export default {
  contractName: "PomodoroRewards",
  constructorInputs: [
    {
      name: "categoryId",
      type: "bytes32"
    },
    {
      name: "unlockDelay",
      type: "int"
    }
  ],
  abi: [
    {
      name: "mintAndLockReward",
      inputs: [
        {
          name: "pubkeyhash",
          type: "bytes20"
        }
      ]
    },
    {
      name: "claimReward",
      inputs: [
        {
          name: "userSig",
          type: "sig"
        },
        {
          name: "user",
          type: "pubkey"
        }
      ]
    }
  ],
  bytecode: "OP_2 OP_PICK OP_0 OP_NUMEQUAL OP_IF OP_INPUTINDEX OP_UTXOBYTECODE OP_0 OP_OUTPUTBYTECODE OP_EQUALVERIFY OP_0 OP_UTXOTOKENCATEGORY OP_OVER OP_EQUALVERIFY OP_0 OP_OUTPUTBYTECODE OP_0 OP_UTXOBYTECODE OP_EQUALVERIFY OP_0 OP_OUTPUTTOKENCATEGORY OP_OVER OP_EQUALVERIFY OP_0 OP_OUTPUTVALUE OP_0 OP_UTXOVALUE OP_NUMEQUALVERIFY OP_0 OP_OUTPUTTOKENAMOUNT OP_0 OP_UTXOTOKENAMOUNT OP_NUMEQUALVERIFY OP_1 OP_OUTPUTBYTECODE OP_INPUTINDEX OP_UTXOBYTECODE OP_EQUALVERIFY OP_1 OP_OUTPUTTOKENCATEGORY OP_EQUALVERIFY OP_1 OP_OUTPUTTOKENAMOUNT OP_0 OP_NUMEQUALVERIFY OP_1 OP_UTXOBYTECODE 76a914 OP_4 OP_PICK OP_CAT 88ac OP_CAT OP_EQUALVERIFY OP_1 OP_UTXOTOKENCATEGORY OP_0 OP_EQUALVERIFY OP_TXLOCKTIME OP_1 OP_4 OP_ROLL OP_CAT OP_SWAP OP_CAT OP_1 OP_OUTPUTTOKENCOMMITMENT OP_EQUALVERIFY OP_2 OP_BEGIN OP_DUP OP_OUTPUTBYTECODE OP_INPUTINDEX OP_UTXOBYTECODE OP_EQUAL OP_NOT OP_VERIFY OP_DUP OP_OUTPUTTOKENCATEGORY OP_0 OP_EQUALVERIFY OP_DUP OP_1ADD OP_NIP OP_DUP OP_TXOUTPUTCOUNT OP_GREATERTHANOREQUAL OP_UNTIL OP_2DROP OP_DROP OP_1 OP_ELSE OP_ROT OP_1 OP_NUMEQUALVERIFY OP_0 OP_UTXOTOKENCATEGORY OP_OVER OP_EQUALVERIFY OP_ROT OP_3 OP_PICK OP_CHECKSIGVERIFY OP_0 OP_UTXOTOKENCOMMITMENT OP_1 OP_SPLIT OP_SWAP OP_1 OP_EQUALVERIFY 14 OP_SPLIT OP_SWAP OP_4 OP_ROLL OP_HASH160 OP_EQUALVERIFY OP_BIN2NUM OP_TXLOCKTIME OP_SWAP OP_3 OP_ROLL OP_ADD OP_GREATERTHANOREQUAL OP_VERIFY OP_0 OP_OUTPUTTOKENCATEGORY OP_EQUALVERIFY OP_0 OP_OUTPUTTOKENAMOUNT OP_0 OP_NUMEQUALVERIFY OP_0 OP_OUTPUTVALUE OP_0 OP_UTXOVALUE OP_NUMEQUALVERIFY OP_1 OP_BEGIN OP_DUP OP_OUTPUTTOKENCATEGORY OP_0 OP_EQUALVERIFY OP_DUP OP_1ADD OP_NIP OP_DUP OP_TXOUTPUTCOUNT OP_GREATERTHANOREQUAL OP_UNTIL OP_DROP OP_1 OP_ENDIF",
  source: "pragma cashscript ^0.13.0;\n\n// PomodoroRewards: Public pool for Pomodoro-style NFT rewards\ncontract PomodoroRewards(\n    bytes32 categoryId,   // Token category for the NFT rewards\n    int unlockDelay       // delay in seconds before claim is allowed (e.g. 1500 = 25 minutes)\n) {\n    // -----------------------------------------------------------------------------------\n    // 1) mintAndLockReward: Create (mint) and Lock a reward in one step.\n    //    - Requires a user UTXO with vout=0 to be spent (proof of \"genesis\" or eligibility)\n    //    - The reward is immediately locked to the user and current timestamp.\n    //\n    // Inputs:\n    //  0: Baton UTXO       [NFT] (from this contract)\n    //  1: User UTXO        [BCH] (from user, MUST have vout=0)\n    //\n    // Outputs:\n    //  0: Baton UTXO       [NFT] (back to this contract)\n    //  1: Locked NFT       [NFT] (locked in this contract, commitment = 0x01...ts)\n    //  2: User UTXO        [BCH] (back to user)\n    // -----------------------------------------------------------------------------------\n    function mintAndLockReward(bytes20 pubkeyhash) {\n        // Check that Input 0 is the contract's baton (recursive covenant)\n        require(tx.inputs[this.activeInputIndex].lockingBytecode == tx.outputs[0].lockingBytecode);\n        require(tx.inputs[0].tokenCategory == categoryId);\n\n        // Output 0: Baton UTXO (Recursive)\n        // - Must go back to the same contract address (locking bytecode)\n        // - Must keep the same category and amount (baton)\n        require(tx.outputs[0].lockingBytecode == tx.inputs[0].lockingBytecode); \n        require(tx.outputs[0].tokenCategory == categoryId);\n        require(tx.outputs[0].value == tx.inputs[0].value);\n        require(tx.outputs[0].tokenAmount == tx.inputs[0].tokenAmount);\n\n        // Output 1: Locked NFT (Minted & Locked)\n        // - Locked in this contract\n        // - Same category\n        // - Zero amount (NFT)\n        require(tx.outputs[1].lockingBytecode == tx.inputs[this.activeInputIndex].lockingBytecode);\n        require(tx.outputs[1].tokenCategory == categoryId);\n        require(tx.outputs[1].tokenAmount == 0);\n\n        //\n        require(tx.inputs[1].lockingBytecode == new LockingBytecodeP2PKH(pubkeyhash));              // check that the provided pubkeyhash belongs to the wallet providing input1's utxo\n        require(tx.inputs[1].tokenCategory == 0x); \n\n        // Build commitment: 0x01 || hash160(user) || uint32(timestampStart)\n        // Use tx.time (requires nLockTime set) or tx.locktime\n        bytes ts = bytes(tx.locktime);\n        bytes expectedCommitment = 0x01 + pubkeyhash + ts;\n\n        require(tx.outputs[1].nftCommitment == expectedCommitment);\n\n        // Ensure no other outputs contain tokens\n        int o = 2;\n        do {\n            require(tx.outputs[o].lockingBytecode != tx.inputs[this.activeInputIndex].lockingBytecode);\n            require(tx.outputs[o].tokenCategory == 0x);\n            o = o + 1;\n        } while (o < tx.outputs.length);\n    }\n\n    // -----------------------------------------------------------------------------------\n    // 2) claimReward: user claims the locked reward after unlockDelay\n    //\n    // Inputs:\n    //  0: Locked NFT       [NFT] (from this contract, commitment=0x01...ts)\n    //\n    // Outputs:\n    //  0: User NFT         [NFT] (to User's P2PKH address)\n    // -----------------------------------------------------------------------------------\n    function claimReward(sig userSig, pubkey user) {\n        // Input 0 must be from this contract\n        require(tx.inputs[0].tokenCategory == categoryId);\n\n        // Verify User Signature\n        require(checkSig(userSig, user));\n\n        // Extract commitment\n        bytes commitment = tx.inputs[0].nftCommitment;\n\n        // version = first byte, data = rest\n        bytes version, bytes data = commitment.split(1);\n        require(version == 0x01);\n\n        // userPkhBytes = first 20 bytes of data, tsBytes = remaining 4 bytes\n        bytes userPkhBytes, bytes tsBytes = data.split(20);\n        bytes20 lockedUserPkh = bytes20(userPkhBytes);\n\n        // Verify the claiming user matches the locked user\n        bytes20 userPkh = hash160(user);\n        require(lockedUserPkh == userPkh);\n\n        // Check Time Delay\n        int startTime = int(bytes(tsBytes));\n        require(tx.locktime >= (startTime + unlockDelay));\n\n        // Output 0: Send NFT to User\n        require(tx.outputs[0].tokenCategory == categoryId);\n        require(tx.outputs[0].tokenAmount == 0); // NFT\n        require(tx.outputs[0].value == tx.inputs[0].value);\n\n        // Ensure no other outputs contain tokens\n        int o = 1;\n        do {\n            require(tx.outputs[o].tokenCategory == 0x);\n            o = o + 1;\n        } while (o < tx.outputs.length);\n    }\n}\n",
  debug: {
    bytecode: "5279009c63c0c700cd8800ce788800cd00c78800d1788800cc00c69d00d300d09d51cdc0c78851d18851d3009d51c70376a91454797e0288ac7e8851ce0088c551547a7e7c7e51d288526576cdc0c787916976d10088768b7776c4a2666d7551677b519d00ce78887b5379ad00cf517f7c518801147f7c547aa98881c57c537a93a26900d18800d3009d00cc00c69d516576d10088768b7776c4a266755168",
    sourceMap: "22:4:61:5;;;;;24:26:24:47;:16::64:1;:79::80:0;:68::97:1;:8::99;25:26:25:27:0;:16::42:1;:46::56:0;:8::58:1;30:27:30:28:0;:16::45:1;:59::60:0;:49::77:1;:8::79;31:27:31:28:0;:16::43:1;:47::57:0;:8::59:1;32:27:32:28:0;:16::35:1;:49::50:0;:39::57:1;:8::59;33:27:33:28:0;:16::41:1;:55::56:0;:45::69:1;:8::71;39:27:39:28:0;:16::45:1;:59::80:0;:49::97:1;:8::99;40:27:40:28:0;:16::43:1;:8::59;41:27:41:28:0;:16::41:1;:45::46:0;:8::48:1;44:26:44:27:0;:16::44:1;:48::84:0;:73::83;;:48::84:1;;;:8::86;45:26:45:27:0;:16::42:1;:46::48:0;:8::50:1;49:25:49:36:0;50:35:50:39;:42::52;;:35:::1;:55::57:0;:35:::1;52:27:52:28:0;:16::43:1;:8::67;55:16:55:17:0;56:8:60:40;57:31:57:32;:20::49:1;:63::84:0;:53::101:1;:20;;:12::103;58:31:58:32:0;:20::47:1;:51::53:0;:12::55:1;59:16:59:17:0;:::21:1;:12::22;60:17:60:18:0;:21::38;56:8::40:1;;22:4:61:5;;;;72::109::0;;;74:26:74:27;:16::42:1;:46::56:0;:8::58:1;77:25:77:32:0;:34::38;;:8::41:1;80:37:80:38:0;:27::53:1;83:53:83:54:0;:36::55:1;84:16:84:23:0;:27::31;:8::33:1;87:55:87:57:0;:44::58:1;88:40:88:52:0;91:34:91:38;;:26::39:1;92:8:92:42;95:24:95:43;96:16:96:27:0;:32::41;:44::55;;:32:::1;:16::56;:8::58;99:27:99:28:0;:16::43:1;:8::59;100:27:100:28:0;:16::41:1;:45::46:0;:8::48:1;101:27:101:28:0;:16::35:1;:49::50:0;:39::57:1;:8::59;104:16:104:17:0;105:8:108:40;106:31:106:32;:20::47:1;:51::53:0;:12::55:1;107:16:107:17:0;:::21:1;:12::22;108:17:108:18:0;:21::38;105:8::40:1;;72:4:109:5;;4:0:110:1",
    logs: [],
    requires: [
      {
        ip: 11,
        line: 24
      },
      {
        ip: 15,
        line: 25
      },
      {
        ip: 20,
        line: 30
      },
      {
        ip: 24,
        line: 31
      },
      {
        ip: 29,
        line: 32
      },
      {
        ip: 34,
        line: 33
      },
      {
        ip: 39,
        line: 39
      },
      {
        ip: 42,
        line: 40
      },
      {
        ip: 46,
        line: 41
      },
      {
        ip: 55,
        line: 44
      },
      {
        ip: 59,
        line: 45
      },
      {
        ip: 69,
        line: 52
      },
      {
        ip: 78,
        line: 57
      },
      {
        ip: 82,
        line: 58
      },
      {
        ip: 100,
        line: 74
      },
      {
        ip: 104,
        line: 77
      },
      {
        ip: 111,
        line: 84
      },
      {
        ip: 118,
        line: 92
      },
      {
        ip: 126,
        line: 96
      },
      {
        ip: 129,
        line: 99
      },
      {
        ip: 133,
        line: 100
      },
      {
        ip: 138,
        line: 101
      },
      {
        ip: 144,
        line: 106
      }
    ]
  },
  compiler: {
    name: "cashc",
    version: "0.13.0-next.1"
  },
  updatedAt: "2025-11-22T03:22:45.739Z"
} as const;