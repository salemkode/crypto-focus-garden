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
      inputs: [
        {
          name: "plantedAt",
          type: "int"
        },
        {
          name: "units",
          type: "int"
        },
        {
          name: "rewardPkh",
          type: "bytes20"
        }
      ]
    },
    {
      name: "claimReward",
      inputs: []
    }
  ],
  bytecode: "OP_OVER OP_0 OP_NUMEQUAL OP_IF OP_INPUTINDEX OP_0 OP_NUMEQUALVERIFY OP_3 OP_PICK OP_3 OP_NUMEQUAL OP_4 OP_PICK OP_6 OP_NUMEQUAL OP_BOOLOR OP_VERIFY OP_2 OP_PICK 0065cd1d OP_GREATERTHANOREQUAL OP_3 OP_PICK ffffffff00 OP_LESSTHANOREQUAL OP_BOOLAND OP_VERIFY OP_0 OP_UTXOTOKENCATEGORY OP_OVER OP_2 OP_CAT OP_EQUALVERIFY OP_0 OP_UTXOTOKENCOMMITMENT OP_0 OP_EQUALVERIFY OP_0 OP_UTXOTOKENAMOUNT OP_0 OP_NUMEQUALVERIFY OP_TXOUTPUTCOUNT OP_2 OP_GREATERTHANOREQUAL OP_VERIFY OP_0 OP_OUTPUTBYTECODE OP_0 OP_UTXOBYTECODE OP_EQUALVERIFY OP_0 OP_OUTPUTTOKENCATEGORY OP_0 OP_UTXOTOKENCATEGORY OP_EQUALVERIFY OP_0 OP_OUTPUTTOKENCOMMITMENT OP_0 OP_EQUALVERIFY OP_0 OP_OUTPUTTOKENAMOUNT OP_0 OP_NUMEQUALVERIFY OP_0 OP_OUTPUTVALUE OP_0 OP_UTXOVALUE OP_NUMEQUALVERIFY OP_1 OP_UTXOTOKENCATEGORY OP_0 OP_EQUALVERIFY OP_1 OP_UTXOBYTECODE OP_DUP OP_SIZE OP_NIP 19 OP_NUMEQUALVERIFY OP_DUP OP_3 OP_SPLIT OP_DROP 76a914 OP_EQUALVERIFY 17 OP_SPLIT OP_NIP 88ac OP_EQUALVERIFY 76a914 OP_5 OP_ROLL OP_CAT 88ac OP_CAT OP_DUP OP_SIZE OP_NIP 19 OP_NUMEQUALVERIFY OP_DUP OP_3 OP_SPLIT OP_DROP 76a914 OP_EQUALVERIFY OP_DUP 17 OP_SPLIT OP_NIP 88ac OP_EQUALVERIFY OP_1 OP_OUTPUTBYTECODE OP_0 OP_UTXOBYTECODE OP_EQUALVERIFY OP_1 OP_OUTPUTTOKENCATEGORY OP_ROT OP_1 OP_CAT OP_EQUALVERIFY OP_1 OP_OUTPUTTOKENAMOUNT OP_0 OP_NUMEQUALVERIFY OP_1 OP_OUTPUTVALUE e803 OP_GREATERTHANOREQUAL OP_VERIFY OP_1 OP_OUTPUTTOKENCOMMITMENT OP_3 OP_ROT OP_CAT OP_3 OP_ROLL OP_5 OP_NUM2BIN OP_4 OP_SPLIT OP_DROP OP_CAT OP_3 OP_ROLL OP_1 OP_NUM2BIN OP_CAT OP_EQUALVERIFY OP_TXOUTPUTCOUNT OP_2 OP_GREATERTHAN OP_IF OP_2 OP_BEGIN OP_DUP OP_OUTPUTTOKENCATEGORY OP_0 OP_EQUALVERIFY OP_DUP OP_OUTPUTBYTECODE OP_0 OP_UTXOBYTECODE OP_EQUAL OP_NOT OP_VERIFY OP_DUP OP_1ADD OP_NIP OP_DUP OP_TXOUTPUTCOUNT OP_GREATERTHANOREQUAL OP_UNTIL OP_DROP OP_ENDIF OP_DROP OP_1 OP_ELSE OP_SWAP OP_1 OP_NUMEQUALVERIFY OP_INPUTINDEX OP_0 OP_NUMEQUALVERIFY OP_0 OP_UTXOTOKENCATEGORY OP_OVER OP_1 OP_CAT OP_EQUALVERIFY OP_0 OP_UTXOTOKENAMOUNT OP_0 OP_NUMEQUALVERIFY OP_0 OP_UTXOTOKENCOMMITMENT OP_DUP OP_SIZE OP_NIP 1f OP_NUMEQUALVERIFY OP_DUP OP_1 OP_SPLIT OP_DROP OP_3 OP_EQUALVERIFY OP_DUP OP_1 OP_SPLIT OP_NIP 19 OP_SPLIT OP_DROP OP_OVER 1e OP_SPLIT OP_NIP OP_BIN2NUM OP_DUP OP_3 OP_NUMEQUAL OP_OVER OP_6 OP_NUMEQUAL OP_BOOLOR OP_VERIFY 000040 OP_ADD OP_CHECKSEQUENCEVERIFY OP_DROP OP_0 OP_OUTPUTBYTECODE OP_EQUALVERIFY OP_0 OP_OUTPUTTOKENCATEGORY OP_ROT OP_EQUALVERIFY OP_0 OP_OUTPUTTOKENAMOUNT OP_0 OP_NUMEQUALVERIFY OP_0 OP_OUTPUTTOKENCOMMITMENT OP_EQUALVERIFY OP_0 OP_OUTPUTVALUE OP_0 OP_UTXOVALUE OP_NUMEQUALVERIFY OP_TXOUTPUTCOUNT OP_1 OP_GREATERTHAN OP_IF OP_1 OP_BEGIN OP_DUP OP_OUTPUTTOKENCATEGORY OP_0 OP_EQUALVERIFY OP_DUP OP_1ADD OP_NIP OP_DUP OP_TXOUTPUTCOUNT OP_GREATERTHANOREQUAL OP_UNTIL OP_DROP OP_ENDIF OP_1 OP_ENDIF",
  source: "pragma cashscript ^0.13.0;\n// v3: version | owner script (25) | plantedAt (4) | 512-second units (1).\n// Dates are metadata; elapsed time is enforced independently by consensus.\ncontract PomodoroRewards(bytes32 categoryId) {\n    function mintAndLockReward(int plantedAt, int units, bytes20 rewardPkh) {\n        require(this.activeInputIndex == 0);\n        require(units == 3 || units == 6);\n        // Unsigned 32-bit seconds; bytes4() alone would reject values from 2^31 (January 2038).\n        require(plantedAt >= 500000000 && plantedAt <= 4294967295);\n        require(tx.inputs[0].tokenCategory == categoryId + 0x02);\n        require(tx.inputs[0].nftCommitment == 0x);\n        require(tx.inputs[0].tokenAmount == 0);\n        require(tx.outputs.length >= 2);\n        require(tx.outputs[0].lockingBytecode == tx.inputs[0].lockingBytecode);\n        require(tx.outputs[0].tokenCategory == tx.inputs[0].tokenCategory);\n        require(tx.outputs[0].nftCommitment == 0x);\n        require(tx.outputs[0].tokenAmount == 0);\n        require(tx.outputs[0].value == tx.inputs[0].value);\n        require(tx.inputs[1].tokenCategory == 0x);\n        // Funding input is a P2PKH wallet. The web dapp may send the reward to that same wallet;\n        // the separate-owner rule is enforced by Focus Forest v5, which supersedes this contract.\n        bytes funder = tx.inputs[1].lockingBytecode;\n        require(funder.length == 25);\n        require(funder.split(3)[0] == 0x76a914);\n        require(funder.split(23)[1] == 0x88ac);\n        bytes owner = new LockingBytecodeP2PKH(rewardPkh);\n        require(owner.length == 25);\n        require(owner.split(3)[0] == 0x76a914);\n        require(owner.split(23)[1] == 0x88ac);\n        require(tx.outputs[1].lockingBytecode == tx.inputs[0].lockingBytecode);\n        require(tx.outputs[1].tokenCategory == categoryId + 0x01);\n        require(tx.outputs[1].tokenAmount == 0);\n        require(tx.outputs[1].value >= 1000);\n        require(tx.outputs[1].nftCommitment == 0x03 + owner + bytes5(plantedAt).split(4)[0] + bytes1(units));\n        if (tx.outputs.length > 2) {\n            int o = 2;\n            do {\n                require(tx.outputs[o].tokenCategory == 0x);\n                require(tx.outputs[o].lockingBytecode != tx.inputs[0].lockingBytecode);\n                o = o + 1;\n            } while (o < tx.outputs.length);\n        }\n    }\n    function claimReward() {\n        require(this.activeInputIndex == 0);\n        require(tx.inputs[0].tokenCategory == categoryId + 0x01);\n        require(tx.inputs[0].tokenAmount == 0);\n        bytes commitment = tx.inputs[0].nftCommitment;\n        require(commitment.length == 31);\n        require(commitment.split(1)[0] == 0x03);\n        bytes owner = commitment.split(1)[1].split(25)[0];\n        int units = int(commitment.split(30)[1]);\n        require(units == 3 || units == 6);\n        // BIP68 time flag; consensus measures age from confirmation using MTP.\n        require(this.age >= 4194304 + units);\n        require(tx.outputs[0].lockingBytecode == owner);\n        require(tx.outputs[0].tokenCategory == categoryId);\n        require(tx.outputs[0].tokenAmount == 0);\n        require(tx.outputs[0].nftCommitment == commitment);\n        require(tx.outputs[0].value == tx.inputs[0].value);\n        if (tx.outputs.length > 1) {\n            int o = 1;\n            do {\n                require(tx.outputs[o].tokenCategory == 0x);\n                o = o + 1;\n            } while (o < tx.outputs.length);\n        }\n    }\n}\n",
  debug: {
    bytecode: "78009c63c0009d5379539c5479569c9b695279040065cd1da2537905ffffffff00a19a6900ce78527e8800cf008800d0009dc452a26900cd00c78800d100ce8800d2008800d3009d00cc00c69d51ce008851c776827701199d76537f750376a9148801177f770288ac880376a914557a7e0288ac7e76827701199d76537f750376a914887601177f770288ac8851cd00c78851d17b517e8851d3009d51cc02e803a26951d2537b7e537a5580547f757e537a51807e88c452a063526576d1008876cd00c7879169768b7776c4a26675687551677c519dc0009d00ce78517e8800d0009d00cf768277011f9d76517f75538876517f7701197f7578011e7f778176539c78569c9b690300004093b27500cd8800d17b8800d3009d00d28800cc00c69dc451a063516576d10088768b7776c4a26675685168",
    sourceMap: "5:4:43:5;;;;6:16:6:37;:41::42;:8::44:1;7:16:7:21:0;;:25::26;:16:::1;:30::35:0;;:39::40;:30:::1;:16;:8::42;9:16:9:25:0;;:29::38;:16:::1;:42::51:0;;:55::65;:42:::1;:16;:8::67;10:26:10:27:0;:16::42:1;:46::56:0;:59::63;:46:::1;:8::65;11:26:11:27:0;:16::42:1;:46::48:0;:8::50:1;12:26:12:27:0;:16::40:1;:44::45:0;:8::47:1;13:16:13:33:0;:37::38;:16:::1;:8::40;14:27:14:28:0;:16::45:1;:59::60:0;:49::77:1;:8::79;15:27:15:28:0;:16::43:1;:57::58:0;:47::73:1;:8::75;16:27:16:28:0;:16::43:1;:47::49:0;:8::51:1;17:27:17:28:0;:16::41:1;:45::46:0;:8::48:1;18:27:18:28:0;:16::35:1;:49::50:0;:39::57:1;:8::59;19:26:19:27:0;:16::42:1;:46::48:0;:8::50:1;22:33:22:34:0;:23::51:1;23:16:23:22:0;:::29:1;;:33::35:0;:8::37:1;24:16:24:22:0;:29::30;:16::31:1;:::34;:38::46:0;:8::48:1;25:29:25:31:0;:16::32:1;:::35;:39::45:0;:8::47:1;26:22:26:57:0;:47::56;;:22::57:1;;;27:16:27:21:0;:::28:1;;:32::34:0;:8::36:1;28:16:28:21:0;:28::29;:16::30:1;:::33;:37::45:0;:8::47:1;29:16:29:21:0;:28::30;:16::31:1;:::34;:38::44:0;:8::46:1;30:27:30:28:0;:16::45:1;:59::60:0;:49::77:1;:8::79;31:27:31:28:0;:16::43:1;:47::57:0;:60::64;:47:::1;:8::66;32:27:32:28:0;:16::41:1;:45::46:0;:8::48:1;33:27:33:28:0;:16::35:1;:39::43:0;:16:::1;:8::45;34:27:34:28:0;:16::43:1;:47::51:0;:54::59;:47:::1;:69::78:0;;:62::79:1;;:86::87:0;:62::88:1;:::91;:47;:101::106:0;;:94::107:1;;:47;:8::109;35:12:35:29:0;:32::33;:12:::1;:35:42:9:0;36:20:36:21;37:12:41:44;38:35:38:36;:24::51:1;:55::57:0;:16::59:1;39:35:39:36:0;:24::53:1;:67::68:0;:57::85:1;:24;;:16::87;40:20:40:21:0;:::25:1;:16::26;41:21:41:22:0;:25::42;37:12::44:1;;35:35:42:9;;5:4:43:5;;;44::68::0;;;45:16:45:37;:41::42;:8::44:1;46:26:46:27:0;:16::42:1;:46::56:0;:59::63;:46:::1;:8::65;47:26:47:27:0;:16::40:1;:44::45:0;:8::47:1;48:37:48:38:0;:27::53:1;49:16:49:26:0;:::33:1;;:37::39:0;:8::41:1;50:16:50:26:0;:33::34;:16::35:1;:::38;:42::46:0;:8::48:1;51:22:51:32:0;:39::40;:22::41:1;:::44;:51::53:0;:22::54:1;:::57;52:24:52:34:0;:41::43;:24::44:1;:::47;:20::48;53:16:53:21:0;:25::26;:16:::1;:30::35:0;:39::40;:30:::1;:16;:8::42;55:28:55:35:0;:::43:1;:8::45;;56:27:56:28:0;:16::45:1;:8::56;57:27:57:28:0;:16::43:1;:47::57:0;:8::59:1;58:27:58:28:0;:16::41:1;:45::46:0;:8::48:1;59:27:59:28:0;:16::43:1;:8::59;60:27:60:28:0;:16::35:1;:49::50:0;:39::57:1;:8::59;61:12:61:29:0;:32::33;:12:::1;:35:67:9:0;62:20:62:21;63:12:66:44;64:35:64:36;:24::51:1;:55::57:0;:16::59:1;65:20:65:21:0;:::25:1;:16::26;66:21:66:22:0;:25::42;63:12::44:1;;61:35:67:9;;44:4:68:5;4:0:69:1",
    logs: [],
    requires: [
      {
        ip: 7,
        line: 6
      },
      {
        ip: 17,
        line: 7
      },
      {
        ip: 27,
        line: 9
      },
      {
        ip: 33,
        line: 10
      },
      {
        ip: 37,
        line: 11
      },
      {
        ip: 41,
        line: 12
      },
      {
        ip: 45,
        line: 13
      },
      {
        ip: 50,
        line: 14
      },
      {
        ip: 55,
        line: 15
      },
      {
        ip: 59,
        line: 16
      },
      {
        ip: 63,
        line: 17
      },
      {
        ip: 68,
        line: 18
      },
      {
        ip: 72,
        line: 19
      },
      {
        ip: 79,
        line: 23
      },
      {
        ip: 85,
        line: 24
      },
      {
        ip: 90,
        line: 25
      },
      {
        ip: 101,
        line: 27
      },
      {
        ip: 107,
        line: 28
      },
      {
        ip: 113,
        line: 29
      },
      {
        ip: 118,
        line: 30
      },
      {
        ip: 124,
        line: 31
      },
      {
        ip: 128,
        line: 32
      },
      {
        ip: 133,
        line: 33
      },
      {
        ip: 152,
        line: 34
      },
      {
        ip: 162,
        line: 38
      },
      {
        ip: 169,
        line: 39
      },
      {
        ip: 187,
        line: 45
      },
      {
        ip: 193,
        line: 46
      },
      {
        ip: 197,
        line: 47
      },
      {
        ip: 204,
        line: 49
      },
      {
        ip: 210,
        line: 50
      },
      {
        ip: 230,
        line: 53
      },
      {
        ip: 233,
        line: 55
      },
      {
        ip: 237,
        line: 56
      },
      {
        ip: 241,
        line: 57
      },
      {
        ip: 245,
        line: 58
      },
      {
        ip: 248,
        line: 59
      },
      {
        ip: 253,
        line: 60
      },
      {
        ip: 263,
        line: 64
      }
    ]
  },
  compiler: {
    name: "cashc",
    version: "0.13.0-next.1"
  },
  updatedAt: "2026-11-18T19:36:22.101Z"
} as const;