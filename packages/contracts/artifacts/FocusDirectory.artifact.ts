export default {
  contractName: "FocusDirectory",
  constructorInputs: [
    {
      name: "categoryId",
      type: "bytes32"
    }
  ],
  abi: [
    {
      name: "register",
      inputs: [
        {
          name: "holderPkh",
          type: "bytes20"
        },
        {
          name: "name",
          type: "bytes"
        }
      ]
    }
  ],
  bytecode: "OP_INPUTINDEX OP_0 OP_NUMEQUALVERIFY OP_2 OP_PICK OP_SIZE OP_NIP OP_3 OP_GREATERTHANOREQUAL OP_3 OP_PICK OP_SIZE OP_NIP 20 OP_LESSTHANOREQUAL OP_BOOLAND OP_VERIFY OP_0 OP_UTXOTOKENCATEGORY OP_OVER OP_2 OP_CAT OP_EQUALVERIFY OP_0 OP_UTXOTOKENCOMMITMENT OP_0 OP_EQUALVERIFY OP_0 OP_UTXOTOKENAMOUNT OP_0 OP_NUMEQUALVERIFY OP_TXOUTPUTCOUNT OP_2 OP_GREATERTHANOREQUAL OP_VERIFY OP_0 OP_OUTPUTBYTECODE OP_0 OP_UTXOBYTECODE OP_EQUALVERIFY OP_0 OP_OUTPUTTOKENCATEGORY OP_0 OP_UTXOTOKENCATEGORY OP_EQUALVERIFY OP_0 OP_OUTPUTTOKENCOMMITMENT OP_0 OP_EQUALVERIFY OP_0 OP_OUTPUTTOKENAMOUNT OP_0 OP_NUMEQUALVERIFY OP_0 OP_OUTPUTVALUE OP_0 OP_UTXOVALUE OP_NUMEQUALVERIFY 76a914 OP_ROT OP_CAT 88ac OP_CAT OP_1 OP_UTXOBYTECODE OP_OVER OP_EQUALVERIFY OP_1 OP_UTXOTOKENCATEGORY OP_0 OP_EQUALVERIFY OP_1 OP_BEGIN OP_DUP OP_UTXOBYTECODE OP_0 OP_UTXOBYTECODE OP_EQUAL OP_NOT OP_VERIFY OP_DUP OP_1ADD OP_NIP OP_DUP OP_TXINPUTCOUNT OP_GREATERTHANOREQUAL OP_UNTIL OP_1 OP_OUTPUTBYTECODE OP_ROT OP_EQUALVERIFY OP_1 OP_OUTPUTTOKENCATEGORY OP_ROT OP_EQUALVERIFY OP_1 OP_OUTPUTTOKENAMOUNT OP_0 OP_NUMEQUALVERIFY OP_1 OP_OUTPUTVALUE e803 OP_GREATERTHANOREQUAL OP_VERIFY OP_1 OP_OUTPUTTOKENCOMMITMENT OP_1 OP_3 OP_ROLL OP_CAT OP_EQUALVERIFY OP_TXOUTPUTCOUNT OP_2 OP_GREATERTHAN OP_IF OP_2 OP_BEGIN OP_DUP OP_OUTPUTTOKENCATEGORY OP_0 OP_EQUALVERIFY OP_DUP OP_OUTPUTBYTECODE OP_0 OP_UTXOBYTECODE OP_EQUAL OP_NOT OP_VERIFY OP_DUP OP_1ADD OP_NIP OP_DUP OP_TXOUTPUTCOUNT OP_GREATERTHANOREQUAL OP_UNTIL OP_DROP OP_ENDIF OP_DROP OP_1",
  source: "pragma cashscript ^0.13.0;\n// Focus Directory. Anyone can mint their own profile card: an immutable NFT held by their\n// app wallet, so every Focus Garden member is discoverable by name and can be tipped\n// without anyone typing an address.\n// Profile commitment: 0x01 | display name (3..32 bytes; UTF-8 validity and name uniqueness\n// are checked off-chain by the service and indexer).\n// Cards are immutable, so every card of this category carries a name this contract\n// accepted. Changing a name means registering a new card; indexers use the holder's latest.\n// An optional \"about me\" text rides in an OP_RETURN output of the registration transaction.\ncontract FocusDirectory(bytes32 categoryId) {\n    function register(bytes20 holderPkh, bytes name) {\n        require(this.activeInputIndex == 0);\n        require(name.length >= 3 && name.length <= 32);\n        require(tx.inputs[0].tokenCategory == categoryId + 0x02);\n        require(tx.inputs[0].nftCommitment == 0x);\n        require(tx.inputs[0].tokenAmount == 0);\n        require(tx.outputs.length >= 2);\n        require(tx.outputs[0].lockingBytecode == tx.inputs[0].lockingBytecode);\n        require(tx.outputs[0].tokenCategory == tx.inputs[0].tokenCategory);\n        require(tx.outputs[0].nftCommitment == 0x);\n        require(tx.outputs[0].tokenAmount == 0);\n        require(tx.outputs[0].value == tx.inputs[0].value);\n        // The registrant pays from, and signs with, the wallet that will hold the card.\n        bytes holder = new LockingBytecodeP2PKH(holderPkh);\n        require(tx.inputs[1].lockingBytecode == holder);\n        require(tx.inputs[1].tokenCategory == 0x);\n        int i = 1;\n        do {\n            require(tx.inputs[i].lockingBytecode != tx.inputs[0].lockingBytecode);\n            i = i + 1;\n        } while (i < tx.inputs.length);\n        require(tx.outputs[1].lockingBytecode == holder);\n        require(tx.outputs[1].tokenCategory == categoryId);\n        require(tx.outputs[1].tokenAmount == 0);\n        require(tx.outputs[1].value >= 1000);\n        require(tx.outputs[1].nftCommitment == 0x01 + name);\n        if (tx.outputs.length > 2) {\n            int o = 2;\n            do {\n                require(tx.outputs[o].tokenCategory == 0x);\n                require(tx.outputs[o].lockingBytecode != tx.inputs[0].lockingBytecode);\n                o = o + 1;\n            } while (o < tx.outputs.length);\n        }\n    }\n}\n",
  debug: {
    bytecode: "c0009d5279827753a2537982770120a19a6900ce78527e8800cf008800d0009dc452a26900cd00c78800d100ce8800d2008800d3009d00cc00c69d0376a9147b7e0288ac7e51c7788851ce0088516576c700c7879169768b7776c3a26651cd7b8851d17b8851d3009d51cc02e803a26951d251537a7e88c452a063526576d1008876cd00c7879169768b7776c4a26675687551",
    sourceMap: "12:16:12:37;:41::42;:8::44:1;13:16:13:20:0;;:::27:1;;:31::32:0;:16:::1;:36::40:0;;:::47:1;;:51::53:0;:36:::1;:16;:8::55;14:26:14:27:0;:16::42:1;:46::56:0;:59::63;:46:::1;:8::65;15:26:15:27:0;:16::42:1;:46::48:0;:8::50:1;16:26:16:27:0;:16::40:1;:44::45:0;:8::47:1;17:16:17:33:0;:37::38;:16:::1;:8::40;18:27:18:28:0;:16::45:1;:59::60:0;:49::77:1;:8::79;19:27:19:28:0;:16::43:1;:57::58:0;:47::73:1;:8::75;20:27:20:28:0;:16::43:1;:47::49:0;:8::51:1;21:27:21:28:0;:16::41:1;:45::46:0;:8::48:1;22:27:22:28:0;:16::35:1;:49::50:0;:39::57:1;:8::59;24:23:24:58:0;:48::57;:23::58:1;;;25:26:25:27:0;:16::44:1;:48::54:0;:8::56:1;26:26:26:27:0;:16::42:1;:46::48:0;:8::50:1;27:16:27:17:0;28:8:31:39;29:30:29:31;:20::48:1;:62::63:0;:52::80:1;:20;;:12::82;30:16:30:17:0;:::21:1;:12::22;31:17:31:18:0;:21::37;28:8::39:1;;32:27:32:28:0;:16::45:1;:49::55:0;:8::57:1;33:27:33:28:0;:16::43:1;:47::57:0;:8::59:1;34:27:34:28:0;:16::41:1;:45::46:0;:8::48:1;35:27:35:28:0;:16::35:1;:39::43:0;:16:::1;:8::45;36:27:36:28:0;:16::43:1;:47::51:0;:54::58;;:47:::1;:8::60;37:12:37:29:0;:32::33;:12:::1;:35:44:9:0;38:20:38:21;39:12:43:44;40:35:40:36;:24::51:1;:55::57:0;:16::59:1;41:35:41:36:0;:24::53:1;:67::68:0;:57::85:1;:24;;:16::87;42:20:42:21:0;:::25:1;:16::26;43:21:43:22:0;:25::42;39:12::44:1;;37:35:44:9;;11:4:45:5;",
    logs: [],
    requires: [
      {
        ip: 3,
        line: 12
      },
      {
        ip: 17,
        line: 13
      },
      {
        ip: 23,
        line: 14
      },
      {
        ip: 27,
        line: 15
      },
      {
        ip: 31,
        line: 16
      },
      {
        ip: 35,
        line: 17
      },
      {
        ip: 40,
        line: 18
      },
      {
        ip: 45,
        line: 19
      },
      {
        ip: 49,
        line: 20
      },
      {
        ip: 53,
        line: 21
      },
      {
        ip: 58,
        line: 22
      },
      {
        ip: 67,
        line: 25
      },
      {
        ip: 71,
        line: 26
      },
      {
        ip: 80,
        line: 29
      },
      {
        ip: 91,
        line: 32
      },
      {
        ip: 95,
        line: 33
      },
      {
        ip: 99,
        line: 34
      },
      {
        ip: 104,
        line: 35
      },
      {
        ip: 111,
        line: 36
      },
      {
        ip: 121,
        line: 40
      },
      {
        ip: 128,
        line: 41
      }
    ]
  },
  compiler: {
    name: "cashc",
    version: "0.13.0-next.1"
  },
  updatedAt: "2026-11-18T19:32:28.519Z"
} as const;