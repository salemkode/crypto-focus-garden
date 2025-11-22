export default {
  contractName: "PomodoroRewards",
  constructorInputs: [
    {
      name: "categoryId",
      type: "bytes32"
    }
  ],
  abi: [
    {
      name: "mintAndLockReward",
      inputs: []
    },
    {
      name: "claimReward",
      inputs: []
    }
  ],
  bytecode: "OP_OVER OP_0 OP_NUMEQUAL OP_IF OP_INPUTINDEX OP_UTXOBYTECODE OP_0 OP_OUTPUTBYTECODE OP_EQUALVERIFY OP_0 OP_UTXOTOKENCATEGORY 20 OP_SPLIT OP_DROP OP_OVER OP_EQUALVERIFY OP_0 OP_OUTPUTBYTECODE OP_0 OP_UTXOBYTECODE OP_EQUALVERIFY OP_0 OP_OUTPUTTOKENCATEGORY 20 OP_SPLIT OP_DROP OP_OVER OP_EQUALVERIFY OP_0 OP_OUTPUTVALUE OP_0 OP_UTXOVALUE OP_NUMEQUALVERIFY OP_0 OP_OUTPUTTOKENAMOUNT OP_0 OP_UTXOTOKENAMOUNT OP_NUMEQUALVERIFY OP_1 OP_OUTPUTBYTECODE OP_INPUTINDEX OP_UTXOBYTECODE OP_EQUALVERIFY OP_1 OP_OUTPUTTOKENCATEGORY 20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_1 OP_OUTPUTTOKENAMOUNT OP_0 OP_NUMEQUALVERIFY OP_1 OP_UTXOTOKENCATEGORY OP_0 OP_EQUALVERIFY OP_TXLOCKTIME OP_TXLOCKTIME OP_1 OP_1 OP_UTXOBYTECODE OP_CAT OP_SWAP OP_CAT OP_1 OP_OUTPUTTOKENCOMMITMENT OP_EQUALVERIFY OP_2 OP_BEGIN OP_DUP OP_OUTPUTBYTECODE OP_INPUTINDEX OP_UTXOBYTECODE OP_EQUAL OP_NOT OP_VERIFY OP_DUP OP_OUTPUTTOKENCATEGORY OP_0 OP_EQUALVERIFY OP_DUP OP_1ADD OP_NIP OP_DUP OP_TXOUTPUTCOUNT OP_GREATERTHANOREQUAL OP_UNTIL OP_2DROP OP_DROP OP_1 OP_ELSE OP_SWAP OP_1 OP_NUMEQUALVERIFY OP_0 OP_UTXOTOKENCATEGORY 20 OP_SPLIT OP_DROP OP_OVER OP_EQUALVERIFY OP_0 OP_UTXOTOKENCOMMITMENT OP_1 OP_SPLIT OP_SWAP OP_1 OP_EQUALVERIFY 19 OP_SPLIT OP_DROP OP_0 OP_UTXOBYTECODE OP_EQUALVERIFY OP_TXLOCKTIME 64 OP_GREATERTHANOREQUAL OP_VERIFY OP_0 OP_OUTPUTTOKENCATEGORY 20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_0 OP_OUTPUTTOKENAMOUNT OP_0 OP_NUMEQUALVERIFY OP_0 OP_OUTPUTVALUE OP_0 OP_UTXOVALUE OP_NUMEQUALVERIFY OP_1 OP_BEGIN OP_DUP OP_OUTPUTTOKENCATEGORY OP_0 OP_EQUALVERIFY OP_DUP OP_1ADD OP_NIP OP_DUP OP_TXOUTPUTCOUNT OP_GREATERTHANOREQUAL OP_UNTIL OP_DROP OP_1 OP_ENDIF",
  source: "pragma cashscript ^0.13.0;\n\n// PomodoroRewards: Public pool for Pomodoro-style NFT rewards\ncontract PomodoroRewards(\n    bytes32 categoryId,   // Token category for the NFT rewards (32 bytes only)\n    // int unlockDelay       // delay in seconds before claim is allowed (e.g. 1500 = 25 minutes)\n) {\n    // -----------------------------------------------------------------------------------\n    // 1) mintAndLockReward: Create (mint) and Lock a reward in one step.\n    //    - Requires a user UTXO with vout=0 to be spent (proof of \"genesis\" or eligibility)\n    //    - The reward is immediately locked to the user and current timestamp.\n    //\n    // Inputs:\n    //  0: Baton UTXO       [NFT] (from this contract)\n    //  1: User UTXO        [BCH] (from user, MUST have vout=0)\n    //\n    // Outputs:\n    //  0: Baton UTXO       [NFT] (back to this contract)\n    //  1: Locked NFT       [NFT] (locked in this contract, commitment = 0x01 || userPkh || ts)\n    //  2+: Optional BCH change back to user (no tokens allowed)\n    // -----------------------------------------------------------------------------------\n    function mintAndLockReward() {\n        // Ensure this input is the covenant itself (recursive covenant check)\n        require(tx.inputs[this.activeInputIndex].lockingBytecode == tx.outputs[0].lockingBytecode);\n\n        // Input 0 must be the baton from the same category\n        bytes32 in0Cat = tx.inputs[0].tokenCategory.split(32)[0];\n        require(in0Cat == categoryId);\n\n        // Output 0: Baton UTXO (recursive)\n        // - Same locking bytecode (same contract)\n        // - Same category (first 32 bytes)\n        // - Same value and tokenAmount (baton preserved)\n        require(tx.outputs[0].lockingBytecode == tx.inputs[0].lockingBytecode);\n        bytes32 out0Cat = tx.outputs[0].tokenCategory.split(32)[0];\n        require(out0Cat == categoryId);\n        require(tx.outputs[0].value == tx.inputs[0].value);\n        require(tx.outputs[0].tokenAmount == tx.inputs[0].tokenAmount);\n\n        // Output 1: Locked NFT (minted & locked)\n        // - Locked in this contract\n        // - Same category (first 32 bytes)\n        // - tokenAmount == 0 (NFT)\n        require(tx.outputs[1].lockingBytecode == tx.inputs[this.activeInputIndex].lockingBytecode);\n        bytes32 out1Cat = tx.outputs[1].tokenCategory.split(32)[0];\n        require(out1Cat == categoryId);\n        require(tx.outputs[1].tokenAmount == 0);\n\n        // Input 1: User UTXO (proof-of-eligibility)\n        // - Must be simple BCH (no tokens)\n        // - Must be from P2PKH(pubkeyhash)\n        require(tx.inputs[1].tokenCategory == 0x);\n\n        // Build commitment: 0x01 || hash160(user) || uint32(timestampStart)\n        // Using tx.locktime as the session start timestamp\n        int time = tx.locktime;\n        bytes ts = bytes(tx.locktime);\n        console.log(ts);\n        console.log(time);\n        bytes expectedCommitment = 0x01 + tx.inputs[1].lockingBytecode + ts;\n\n        bytes commitment = tx.outputs[1].nftCommitment;\n        console.log(commitment, expectedCommitment);\n        require(commitment == expectedCommitment);\n\n        // Ensure no other outputs (index >= 2) contain tokens or same covenant bytecode\n        int o = 2;\n\n        do {\n            // No extra covenant outputs\n            require(tx.outputs[o].lockingBytecode != tx.inputs[this.activeInputIndex].lockingBytecode);\n            // No tokens in any other output\n            require(tx.outputs[o].tokenCategory == 0x);\n            o = o + 1;\n        } while (o < tx.outputs.length);\n    }\n\n    // -----------------------------------------------------------------------------------\n    // 2) claimReward: user claims the locked reward after unlockDelay\n    //\n    // Inputs:\n    //  0: Locked NFT       [NFT] (from this contract, commitment=0x01 || userPkh || ts)\n    //\n    // Outputs:\n    //  0: User NFT         [NFT] (to User's P2PKH address)\n    //  1+: Optional BCH change (no tokens allowed)\n    // -----------------------------------------------------------------------------------\n    function claimReward() {\n        // Input 0 must be from the correct token category (first 32 bytes)\n        bytes32 in0Cat = tx.inputs[0].tokenCategory.split(32)[0];\n        require(in0Cat == categoryId);\n\n        // Extract commitment from input 0\n        bytes commitment = tx.inputs[0].nftCommitment;\n\n        // version = first byte, data = rest\n        bytes version, bytes data = commitment.split(1);\n        require(version == 0x01);\n\n        // userPkhBytes = first 20 bytes of data, tsBytes = remaining 4 bytes (timestamp)\n        // bytes lockingBytecode, bytes tsBytes = data.split(25);\n        bytes lockingBytecode = data.split(25)[0];\n\n        // Verify claiming user matches locked user\n        require(lockingBytecode == tx.inputs[0].lockingBytecode);\n\n        // Check time delay: tx.locktime >= startTime + unlockDelay\n        // int startTime = int(bytes(tsBytes));\n        // For now we do not need put timer it just 100ms\n        // ! TODO: require(tx.locktime >= finalTime);\n        // int finalTime = startTime + unlockDelay;\n        // console.log(tx.locktime, finalTime);\n        require(tx.locktime >= 100);\n\n        // Output 0: Send NFT to user\n        bytes32 out0Cat = tx.outputs[0].tokenCategory.split(32)[0];\n        require(out0Cat == categoryId);\n        require(tx.outputs[0].tokenAmount == 0);            // NFT\n        require(tx.outputs[0].value == tx.inputs[0].value); // preserve BCH amount\n\n        // Ensure no other outputs contain tokens\n        int o = 1;\n        do {\n            require(tx.outputs[o].tokenCategory == 0x);\n            o = o + 1;\n        } while (o < tx.outputs.length);\n    }\n}\n",
  debug: {
    bytecode: "78009c63c0c700cd8800ce01207f75788800cd00c78800d101207f75788800cc00c69d00d300d09d51cdc0c78851d101207f758851d3009d51ce0088c5c55151c77e7c7e51d288526576cdc0c787916976d10088768b7776c4a2666d7551677c519d00ce01207f75788800cf517f7c518801197f7500c788c50164a26900d101207f758800d3009d00cc00c69d516576d10088768b7776c4a266755168",
    sourceMap: "22:4:76:5;;;;24:26:24:47;:16::64:1;:79::80:0;:68::97:1;:8::99;27:35:27:36:0;:25::51:1;:58::60:0;:25::61:1;:::64;28:26:28:36:0;:8::38:1;34:27:34:28:0;:16::45:1;:59::60:0;:49::77:1;:8::79;35:37:35:38:0;:26::53:1;:60::62:0;:26::63:1;:::66;36:27:36:37:0;:8::39:1;37:27:37:28:0;:16::35:1;:49::50:0;:39::57:1;:8::59;38:27:38:28:0;:16::41:1;:55::56:0;:45::69:1;:8::71;44:27:44:28:0;:16::45:1;:59::80:0;:49::97:1;:8::99;45:37:45:38:0;:26::53:1;:60::62:0;:26::63:1;:::66;46:8:46:39;47:27:47:28:0;:16::41:1;:45::46:0;:8::48:1;52:26:52:27:0;:16::42:1;:46::48:0;:8::50:1;56:19:56:30:0;57:25:57:36;60:35:60:39;:52::53;:42::70:1;:35;:73::75:0;:35:::1;62:38:62:39:0;:27::54:1;64:8:64:50;67:16:67:17:0;69:8:75:40;71:31:71:32;:20::49:1;:63::84:0;:53::101:1;:20;;:12::103;73:31:73:32:0;:20::47:1;:51::53:0;:12::55:1;74:16:74:17:0;:::21:1;:12::22;75:17:75:18:0;:21::38;69:8::40:1;;22:4:76:5;;;;88::127::0;;;90:35:90:36;:25::51:1;:58::60:0;:25::61:1;:::64;91:26:91:36:0;:8::38:1;94:37:94::0;:27::53:1;97:53:97:54:0;:36::55:1;98:16:98:23:0;:27::31;:8::33:1;102:43:102:45:0;:32::46:1;:::49;105:45:105:46:0;:35::63:1;:8::65;113:16:113:27:0;:31::34;:16:::1;:8::36;116:37:116:38:0;:26::53:1;:60::62:0;:26::63:1;:::66;117:8:117:39;118:27:118:28:0;:16::41:1;:45::46:0;:8::48:1;119:27:119:28:0;:16::35:1;:49::50:0;:39::57:1;:8::59;122:16:122:17:0;123:8:126:40;124:31:124:32;:20::47:1;:51::53:0;:12::55:1;125:16:125:17:0;:::21:1;:12::22;126:17:126:18:0;:21::38;123:8::40:1;;88:4:127:5;;4:0:128:1",
    logs: [
      {
        ip: 60,
        line: 58,
        data: [
          {
            stackIndex: 0,
            type: "bytes",
            ip: 60
          }
        ]
      },
      {
        ip: 60,
        line: 59,
        data: [
          {
            stackIndex: 1,
            type: "int",
            ip: 60
          }
        ]
      },
      {
        ip: 68,
        line: 63,
        data: [
          {
            stackIndex: 0,
            type: "bytes",
            ip: 68
          },
          {
            stackIndex: 1,
            type: "bytes",
            ip: 68
          }
        ]
      }
    ],
    requires: [
      {
        ip: 9,
        line: 24
      },
      {
        ip: 16,
        line: 28
      },
      {
        ip: 21,
        line: 34
      },
      {
        ip: 28,
        line: 36
      },
      {
        ip: 33,
        line: 37
      },
      {
        ip: 38,
        line: 38
      },
      {
        ip: 43,
        line: 44
      },
      {
        ip: 49,
        line: 46
      },
      {
        ip: 53,
        line: 47
      },
      {
        ip: 57,
        line: 52
      },
      {
        ip: 68,
        line: 64
      },
      {
        ip: 77,
        line: 71
      },
      {
        ip: 81,
        line: 73
      },
      {
        ip: 102,
        line: 91
      },
      {
        ip: 109,
        line: 98
      },
      {
        ip: 115,
        line: 105
      },
      {
        ip: 119,
        line: 113
      },
      {
        ip: 125,
        line: 117
      },
      {
        ip: 129,
        line: 118
      },
      {
        ip: 134,
        line: 119
      },
      {
        ip: 140,
        line: 124
      }
    ]
  },
  compiler: {
    name: "cashc",
    version: "0.13.0-next.1"
  },
  updatedAt: "2025-11-22T17:35:14.983Z"
} as const;