export default {
  contractName: "P2PKH",
  constructorInputs: [],
  abi: [
    {
      name: "plant",
      inputs: []
    },
    {
      name: "uproot",
      inputs: []
    }
  ],
  bytecode: "OP_DUP OP_0 OP_NUMEQUAL OP_IF OP_0 OP_OUTPUTBYTECODE OP_0 OP_UTXOBYTECODE OP_EQUALVERIFY OP_0 OP_OUTPUTTOKENCATEGORY OP_0 OP_UTXOTOKENCATEGORY OP_EQUALVERIFY OP_0 OP_OUTPUTVALUE OP_0 OP_UTXOVALUE OP_NUMEQUALVERIFY OP_0 OP_OUTPUTTOKENAMOUNT OP_0 OP_UTXOTOKENAMOUNT OP_NUMEQUALVERIFY OP_1 OP_OUTPUTTOKENCATEGORY 20 OP_SPLIT OP_SWAP OP_0 OP_UTXOTOKENCATEGORY 20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_0 OP_EQUAL OP_NOT OP_VERIFY OP_1 OP_OUTPUTTOKENCATEGORY OP_0 OP_UTXOTOKENCATEGORY OP_EQUALVERIFY OP_1 OP_OUTPUTVALUE e803 OP_NUMEQUALVERIFY OP_1 OP_OUTPUTTOKENAMOUNT OP_0 OP_NUMEQUALVERIFY OP_1 OP_OUTPUTTOKENCOMMITMENT OP_1 OP_UTXOBYTECODE c800 OP_4 OP_NUM2BIN OP_CAT OP_0 OP_5 OP_NUM2BIN OP_CAT OP_EQUALVERIFY OP_2 OP_BEGIN OP_DUP OP_OUTPUTTOKENCATEGORY OP_0 OP_EQUALVERIFY OP_DUP OP_1ADD OP_NIP OP_DUP OP_TXOUTPUTCOUNT OP_GREATERTHANOREQUAL OP_UNTIL OP_2DROP OP_1 OP_ELSE OP_1 OP_NUMEQUALVERIFY OP_0 OP_BEGIN OP_DUP OP_0 OP_NUMNOTEQUAL OP_IF OP_DUP OP_UTXOBYTECODE OP_ACTIVEBYTECODE OP_EQUAL OP_NOT OP_VERIFY OP_ENDIF OP_DUP OP_OUTPUTBYTECODE OP_ACTIVEBYTECODE OP_EQUAL OP_NOT OP_VERIFY OP_DUP OP_1ADD OP_NIP OP_DUP OP_TXOUTPUTCOUNT OP_GREATERTHANOREQUAL OP_UNTIL OP_0 OP_OUTPUTBYTECODE OP_0 OP_UTXOBYTECODE OP_EQUALVERIFY OP_0 OP_OUTPUTTOKENCATEGORY OP_0 OP_UTXOTOKENCATEGORY OP_EQUALVERIFY OP_0 OP_OUTPUTVALUE OP_0 OP_UTXOVALUE OP_NUMEQUALVERIFY OP_0 OP_OUTPUTTOKENAMOUNT OP_0 OP_UTXOTOKENAMOUNT OP_NUMEQUALVERIFY OP_0 OP_OUTPUTTOKENCOMMITMENT OP_1 OP_UTXOBYTECODE c800 OP_4 OP_NUM2BIN OP_CAT OP_0 OP_5 OP_NUM2BIN OP_CAT OP_EQUALVERIFY OP_0 OP_OUTPUTTOKENCATEGORY 20 OP_SPLIT OP_NIP OP_0 OP_EQUALVERIFY OP_0 OP_OUTPUTTOKENCATEGORY 20 OP_SPLIT OP_NIP OP_0 OP_EQUAL OP_NOT OP_VERIFY OP_1 OP_OUTPUTTOKENCATEGORY OP_0 OP_UTXOTOKENCATEGORY OP_EQUALVERIFY OP_1 OP_OUTPUTVALUE e803 OP_NUMEQUALVERIFY OP_1 OP_OUTPUTTOKENAMOUNT OP_0 OP_NUMEQUALVERIFY OP_1 OP_OUTPUTTOKENCOMMITMENT OP_1 OP_UTXOBYTECODE c800 OP_4 OP_NUM2BIN OP_CAT OP_0 OP_5 OP_NUM2BIN OP_CAT OP_EQUALVERIFY OP_2 OP_BEGIN OP_DUP OP_OUTPUTTOKENCATEGORY OP_0 OP_EQUALVERIFY OP_DUP OP_1ADD OP_NIP OP_DUP OP_TXOUTPUTCOUNT OP_GREATERTHANOREQUAL OP_UNTIL OP_2DROP OP_1 OP_ENDIF",
  source: "pragma cashscript ^0.13.0;\n\ncontract P2PKH() {\n  //////////////////////////////////////////////////////////////////////////////////////////\n ////////////////////////////    Initialize a New MintNFT   //////////////////////////////\n//////////////////////////////////////////////////////////////////////////////////////////\n// ------------------------------------------------------------------------------------\n//inputs: \n//  0   managerNFT          [NFT]       (from contract)\n//  1   userUTXO            [BCH]       (from user)\n//outputs:\n//  0   managerNFT          [NFT]       (to contract)\n//  1   userNFT             [NFT]       (to contract)\n//  2   userUTXOs           [NFT]       (to user)\n//////////////////////////////////////////////////////////////////////////////////////////\n    function plant() {\n        // Check mint token is in and out same place\n        require(tx.outputs[0].lockingBytecode == tx.inputs[0].lockingBytecode);                     // carry forward managerNFT\n        require(tx.outputs[0].tokenCategory == tx.inputs[0].tokenCategory);                         // carry forward managerNFT's tokenCategory\n        require(tx.outputs[0].value == tx.inputs[0].value);                                         // carry forward managerNFT's satoshis\n        require(tx.outputs[0].tokenAmount == tx.inputs[0].tokenAmount);\n        \n        // Check is plant is still in contract\n        bytes category, bytes capability = tx.outputs[1].tokenCategory.split(32);                   // get input1 (campaignNFT) category and capability\n        require (category == tx.inputs[0].tokenCategory.split(32)[0]);                              // campaignNFT must be a CashStarter tokenCategory\n        require(capability != 0x);\n        require(tx.outputs[1].tokenCategory == tx.inputs[0].tokenCategory);                         // carry forward managerNFT's tokenCategory\n        require(tx.outputs[1].value == 1000);                                                       // carry forward managerNFT's satoshis\n        require(tx.outputs[1].tokenAmount == 0);                                                    // carry forward managerNFT's existing token balance\n        require(tx.outputs[1].nftCommitment == tx.inputs[1].lockingBytecode + bytes4(200) + bytes5(0));          // set campaign utxo nftCommitment\n\n        // Loop over all other outputs (variable length), and make sure that none of them contain tokens\n        int outputIndex = 2;\n        do {\n            require(tx.outputs[outputIndex].tokenCategory == 0x);\n            outputIndex = outputIndex + 1;\n        } while (outputIndex < tx.outputs.length);\n    }\n\n//inputs: \n//  0   userNFTthatIsPlaning          [NFT]        (from contract)\n//  1   userUTXO            [BCH]        (from user)\n//outputs:\n//  0   userNFTthatIsPlaning [NFT]       (to user)\n//  1   userUTXOs           [BCH]        (to user)\n//////////////////////////////////////////////////////////////////////////////////////////\n    function uproot() {\n        // Check there is no contract back nft\n        int i = 0;\n        do {\n            // Only first utxo will be from contract\n            if (i != 0) require(tx.inputs[i].lockingBytecode != this.activeBytecode);\n            require(tx.outputs[i].lockingBytecode != this.activeBytecode);\n            i = i + 1;\n        } while (i < tx.outputs.length);\n\n        // Check mint token is in and out same place\n        require(tx.outputs[0].lockingBytecode == tx.inputs[0].lockingBytecode);                     // carry forward managerNFT\n        require(tx.outputs[0].tokenCategory == tx.inputs[0].tokenCategory);                         // carry forward managerNFT's tokenCategory\n        require(tx.outputs[0].value == tx.inputs[0].value);                                         // carry forward managerNFT's satoshis\n        require(tx.outputs[0].tokenAmount == tx.inputs[0].tokenAmount);\n        require(tx.outputs[0].nftCommitment == tx.inputs[1].lockingBytecode + bytes4(200) + bytes5(0));          // set campaign utxo nftCommitment\n        require(tx.outputs[0].tokenCategory.split(32)[1] == 0x);          // set campaign utxo nftCommitment\n        \n        // Check is plant is still in contract\n        bytes capability = tx.outputs[0].tokenCategory.split(32)[1];                   // get input1 (campaignNFT) category and capability\n        require(capability != 0x);\n        require(tx.outputs[1].tokenCategory == tx.inputs[0].tokenCategory);                         // carry forward managerNFT's tokenCategory\n        require(tx.outputs[1].value == 1000);                                                       // carry forward managerNFT's satoshis\n        require(tx.outputs[1].tokenAmount == 0);                                                    // carry forward managerNFT's existing token balance\n        require(tx.outputs[1].nftCommitment == tx.inputs[1].lockingBytecode + bytes4(200) + bytes5(0));          // set campaign utxo nftCommitment\n\n        // Loop over all other outputs (variable length), and make sure that none of them contain tokens\n        int outputIndex = 2;\n        do {\n            require(tx.outputs[outputIndex].tokenCategory == 0x);\n            outputIndex = outputIndex + 1;\n        } while (outputIndex < tx.outputs.length);\n    }\n}",
  debug: {
    bytecode: "76009c6300cd00c78800d100ce8800cc00c69d00d300d09d51d101207f7c00ce01207f75880087916951d100ce8851cc02e8039d51d3009d51d251c702c80054807e0055807e88526576d10088768b7776c4a2666d5167519d006576009e6376c7c18791696876cdc1879169768b7776c4a26600cd00c78800d100ce8800cc00c69d00d300d09d00d251c702c80054807e0055807e8800d101207f77008800d101207f770087916951d100ce8851cc02e8039d51d3009d51d251c702c80054807e0055807e88526576d10088768b7776c4a2666d5168",
    sourceMap: "16:4:38:5;;;;18:27:18:28;:16::45:1;:59::60:0;:49::77:1;:8::79;19:27:19:28:0;:16::43:1;:57::58:0;:47::73:1;:8::75;20:27:20:28:0;:16::35:1;:49::50:0;:39::57:1;:8::59;21:27:21:28:0;:16::41:1;:55::56:0;:45::69:1;:8::71;24:54:24:55:0;:43::70:1;:77::79:0;:43::80:1;25:17:25:25:0;:39::40;:29::55:1;:62::64:0;:29::65:1;:::68;:8::70;26:30:26:32:0;:16:::1;;:8::34;27:27:27:28:0;:16::43:1;:57::58:0;:47::73:1;:8::75;28:27:28:28:0;:16::35:1;:39::43:0;:8::45:1;29:27:29:28:0;:16::41:1;:45::46:0;:8::48:1;30:27:30:28:0;:16::43:1;:57::58:0;:47::75:1;:85::88:0;:78::89:1;;:47;:99::100:0;:92::101:1;;:47;:8::103;33:26:33:27:0;34:8:37:50;35:31:35:42;:20::57:1;:61::63:0;:12::65:1;36:26:36:37:0;:::41:1;:12::42;37:17:37:28:0;:31::48;34:8::50:1;;16:4:38:5;;;47::79::0;;49:16:49:17;50:8:55:40;52:16:52:17;:21::22;:16:::1;:24::85:0;:42::43;:32::60:1;:64::83:0;:32:::1;;:24::85;;53:31:53:32:0;:20::49:1;:53::72:0;:20:::1;;:12::74;54:16:54:17:0;:::21:1;:12::22;55:17:55:18:0;:21::38;50:8::40:1;;58:27:58:28:0;:16::45:1;:59::60:0;:49::77:1;:8::79;59:27:59:28:0;:16::43:1;:57::58:0;:47::73:1;:8::75;60:27:60:28:0;:16::35:1;:49::50:0;:39::57:1;:8::59;61:27:61:28:0;:16::41:1;:55::56:0;:45::69:1;:8::71;62:27:62:28:0;:16::43:1;:57::58:0;:47::75:1;:85::88:0;:78::89:1;;:47;:99::100:0;:92::101:1;;:47;:8::103;63:27:63:28:0;:16::43:1;:50::52:0;:16::53:1;:::56;:60::62:0;:8::64:1;66:38:66:39:0;:27::54:1;:61::63:0;:27::64:1;:::67;67:30:67:32:0;:16:::1;;:8::34;68:27:68:28:0;:16::43:1;:57::58:0;:47::73:1;:8::75;69:27:69:28:0;:16::35:1;:39::43:0;:8::45:1;70:27:70:28:0;:16::41:1;:45::46:0;:8::48:1;71:27:71:28:0;:16::43:1;:57::58:0;:47::75:1;:85::88:0;:78::89:1;;:47;:99::100:0;:92::101:1;;:47;:8::103;74:26:74:27:0;75:8:78:50;76:31:76:42;:20::57:1;:61::63:0;:12::65:1;77:26:77:37:0;:::41:1;:12::42;78:17:78:28:0;:31::48;75:8::50:1;;47:4:79:5;;3:0:80:1",
    logs: [],
    requires: [
      {
        ip: 8,
        line: 18
      },
      {
        ip: 13,
        line: 19
      },
      {
        ip: 18,
        line: 20
      },
      {
        ip: 23,
        line: 21
      },
      {
        ip: 34,
        line: 25
      },
      {
        ip: 38,
        line: 26
      },
      {
        ip: 43,
        line: 27
      },
      {
        ip: 47,
        line: 28
      },
      {
        ip: 51,
        line: 29
      },
      {
        ip: 64,
        line: 30
      },
      {
        ip: 70,
        line: 35
      },
      {
        ip: 94,
        line: 52
      },
      {
        ip: 101,
        line: 53
      },
      {
        ip: 113,
        line: 58
      },
      {
        ip: 118,
        line: 59
      },
      {
        ip: 123,
        line: 60
      },
      {
        ip: 128,
        line: 61
      },
      {
        ip: 141,
        line: 62
      },
      {
        ip: 148,
        line: 63
      },
      {
        ip: 157,
        line: 67
      },
      {
        ip: 162,
        line: 68
      },
      {
        ip: 166,
        line: 69
      },
      {
        ip: 170,
        line: 70
      },
      {
        ip: 183,
        line: 71
      },
      {
        ip: 189,
        line: 76
      }
    ]
  },
  compiler: {
    name: "cashc",
    version: "0.13.0-next.1"
  },
  updatedAt: "2025-11-21T12:17:05.938Z"
} as const;