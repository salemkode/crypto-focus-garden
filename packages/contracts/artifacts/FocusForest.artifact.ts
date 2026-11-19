export default {
  contractName: "FocusForest",
  constructorInputs: [
    {
      name: "categoryId",
      type: "bytes32"
    }
  ],
  abi: [
    {
      name: "plantTree",
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
          name: "tier",
          type: "int"
        },
        {
          name: "species",
          type: "int"
        },
        {
          name: "ownerPkh",
          type: "bytes20"
        }
      ]
    },
    {
      name: "mergeTrees",
      inputs: []
    },
    {
      name: "claimTree",
      inputs: []
    }
  ],
  bytecode: "OP_OVER OP_0 OP_NUMEQUAL OP_IF OP_INPUTINDEX OP_0 OP_NUMEQUALVERIFY OP_3 OP_PICK OP_1 OP_GREATERTHANOREQUAL OP_4 OP_PICK 18 OP_LESSTHANOREQUAL OP_BOOLAND OP_VERIFY OP_5 OP_PICK OP_1 OP_GREATERTHANOREQUAL OP_6 OP_PICK OP_6 OP_LESSTHANOREQUAL OP_BOOLAND OP_VERIFY OP_4 OP_PICK OP_1 OP_GREATERTHANOREQUAL OP_5 OP_PICK OP_4 OP_LESSTHANOREQUAL OP_BOOLAND OP_VERIFY OP_4 OP_PICK OP_4 OP_NUMEQUAL OP_IF OP_3 OP_PICK OP_11 OP_GREATERTHANOREQUAL OP_VERIFY OP_ELSE OP_4 OP_PICK OP_3 OP_NUMEQUAL OP_IF OP_3 OP_PICK OP_6 OP_GREATERTHANOREQUAL OP_VERIFY OP_ELSE OP_4 OP_PICK OP_2 OP_NUMEQUAL OP_IF OP_3 OP_PICK OP_3 OP_GREATERTHANOREQUAL OP_VERIFY OP_ENDIF OP_ENDIF OP_ENDIF OP_2 OP_PICK 0065cd1d OP_GREATERTHANOREQUAL OP_3 OP_PICK ffffffff00 OP_LESSTHANOREQUAL OP_BOOLAND OP_VERIFY OP_ROT OP_5 OP_NUM2BIN OP_4 OP_SPLIT OP_DROP OP_0 OP_UTXOTOKENCATEGORY OP_2 OP_PICK OP_2 OP_CAT OP_EQUALVERIFY OP_0 OP_UTXOTOKENCOMMITMENT OP_0 OP_EQUALVERIFY OP_0 OP_UTXOTOKENAMOUNT OP_0 OP_NUMEQUALVERIFY OP_TXOUTPUTCOUNT OP_2 OP_GREATERTHANOREQUAL OP_VERIFY OP_0 OP_OUTPUTBYTECODE OP_0 OP_UTXOBYTECODE OP_EQUALVERIFY OP_0 OP_OUTPUTTOKENCATEGORY OP_0 OP_UTXOTOKENCATEGORY OP_EQUALVERIFY OP_0 OP_OUTPUTTOKENCOMMITMENT OP_0 OP_EQUALVERIFY OP_0 OP_OUTPUTTOKENAMOUNT OP_0 OP_NUMEQUALVERIFY OP_0 OP_OUTPUTVALUE OP_0 OP_UTXOVALUE OP_NUMEQUALVERIFY OP_1 OP_UTXOTOKENCATEGORY OP_0 OP_EQUALVERIFY OP_1 OP_BEGIN OP_DUP OP_UTXOBYTECODE OP_0 OP_UTXOBYTECODE OP_EQUAL OP_NOT OP_VERIFY OP_DUP OP_1ADD OP_NIP OP_DUP OP_TXINPUTCOUNT OP_GREATERTHANOREQUAL OP_UNTIL OP_1 OP_UTXOBYTECODE OP_DUP OP_SIZE OP_NIP 19 OP_NUMEQUALVERIFY OP_DUP OP_3 OP_SPLIT OP_DROP 76a914 OP_EQUALVERIFY OP_DUP 17 OP_SPLIT OP_NIP 88ac OP_EQUALVERIFY OP_DUP OP_3 OP_SPLIT OP_NIP 14 OP_SPLIT OP_DROP OP_9 OP_PICK OP_EQUAL OP_NOT OP_VERIFY OP_HASH160 OP_12 OP_SPLIT OP_DROP OP_1 OP_OUTPUTBYTECODE OP_0 OP_UTXOBYTECODE OP_EQUALVERIFY OP_1 OP_OUTPUTTOKENCATEGORY OP_4 OP_ROLL OP_1 OP_CAT OP_EQUALVERIFY OP_1 OP_OUTPUTTOKENAMOUNT OP_0 OP_NUMEQUALVERIFY OP_1 OP_OUTPUTVALUE e803 OP_GREATERTHANOREQUAL OP_VERIFY OP_1 OP_OUTPUTTOKENCOMMITMENT OP_5 OP_9 OP_ROLL OP_CAT OP_ROT OP_CAT OP_3 OP_ROLL OP_CAT OP_4 OP_ROLL OP_1 OP_NUM2BIN OP_CAT OP_4 OP_ROLL OP_16 OP_MUL OP_5 OP_ROLL OP_ADD OP_1 OP_NUM2BIN OP_CAT OP_EQUALVERIFY OP_TXOUTPUTCOUNT OP_2 OP_GREATERTHAN OP_IF OP_2 OP_BEGIN OP_DUP OP_OUTPUTTOKENCATEGORY OP_0 OP_EQUALVERIFY OP_DUP OP_OUTPUTBYTECODE OP_0 OP_UTXOBYTECODE OP_EQUAL OP_NOT OP_VERIFY OP_DUP OP_1ADD OP_NIP OP_DUP OP_TXOUTPUTCOUNT OP_GREATERTHANOREQUAL OP_UNTIL OP_DROP OP_ENDIF OP_2DROP OP_1 OP_ELSE OP_OVER OP_1 OP_NUMEQUAL OP_IF OP_INPUTINDEX OP_UTXOBYTECODE OP_INPUTINDEX OP_UTXOTOKENCOMMITMENT OP_DUP OP_SIZE OP_NIP 27 OP_NUMEQUALVERIFY OP_DUP 25 OP_SPLIT OP_NIP OP_1 OP_SPLIT OP_DROP OP_BIN2NUM 000040 OP_ADD OP_CHECKSEQUENCEVERIFY OP_DROP OP_0 OP_UTXOBYTECODE OP_2 OP_PICK OP_EQUALVERIFY OP_0 OP_UTXOTOKENCATEGORY OP_3 OP_PICK OP_1 OP_CAT OP_EQUALVERIFY OP_0 OP_UTXOTOKENCOMMITMENT OP_SIZE OP_NIP 27 OP_NUMEQUALVERIFY OP_INPUTINDEX OP_TXINPUTCOUNT OP_1SUB OP_LESSTHAN OP_VERIFY OP_TXOUTPUTCOUNT OP_2 OP_GREATERTHANOREQUAL OP_VERIFY OP_INPUTINDEX OP_0 OP_NUMEQUAL OP_IF OP_DUP 21 OP_SPLIT OP_DROP OP_DUP OP_1 OP_SPLIT OP_DROP OP_5 OP_EQUALVERIFY OP_DUP 15 OP_SPLIT OP_NIP OP_2 OP_PICK 26 OP_SPLIT OP_NIP OP_BIN2NUM OP_DUP OP_16 OP_DIV OP_DUP OP_1 OP_GREATERTHANOREQUAL OP_OVER OP_3 OP_LESSTHANOREQUAL OP_BOOLAND OP_VERIFY OP_2 OP_OVER OP_1 OP_NUMEQUAL OP_IF OP_DROP OP_3 OP_ENDIF OP_TXINPUTCOUNT OP_OVER OP_1ADD OP_NUMEQUALVERIFY OP_0 OP_0 OP_0 OP_BEGIN OP_DUP OP_UTXOTOKENCOMMITMENT OP_OVER OP_UTXOBYTECODE OP_11 OP_PICK OP_EQUALVERIFY OP_OVER OP_UTXOTOKENCATEGORY OP_12 OP_PICK OP_1 OP_CAT OP_EQUALVERIFY OP_OVER OP_UTXOTOKENAMOUNT OP_0 OP_NUMEQUALVERIFY OP_DUP OP_SIZE OP_NIP 27 OP_NUMEQUALVERIFY OP_DUP 21 OP_SPLIT OP_DROP OP_9 OP_PICK OP_EQUALVERIFY OP_DUP 26 OP_SPLIT OP_NIP OP_BIN2NUM OP_16 OP_DIV OP_6 OP_PICK OP_NUMEQUALVERIFY OP_3 OP_PICK OP_OVER OP_CAT OP_4 OP_ROLL OP_DROP OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_FROMALTSTACK OP_FROMALTSTACK OP_2 OP_PICK OP_2 OP_PICK OP_UTXOVALUE OP_ADD OP_3 OP_ROLL OP_DROP OP_SWAP OP_TOALTSTACK OP_SWAP OP_FROMALTSTACK OP_OVER OP_1ADD OP_ROT OP_DROP OP_NIP OP_DUP OP_4 OP_PICK OP_GREATERTHANOREQUAL OP_UNTIL OP_3 OP_PICK OP_UTXOBYTECODE OP_4 OP_PICK OP_UTXOTOKENCATEGORY OP_0 OP_EQUALVERIFY OP_DUP OP_SIZE OP_NIP 19 OP_NUMEQUALVERIFY OP_DUP OP_3 OP_SPLIT OP_DROP 76a914 OP_EQUALVERIFY OP_DUP 17 OP_SPLIT OP_NIP 88ac OP_EQUALVERIFY OP_DUP OP_HASH160 OP_12 OP_SPLIT OP_DROP OP_8 OP_PICK OP_EQUALVERIFY OP_3 OP_PICK OP_HASH256 OP_4 OP_SPLIT OP_DROP OP_6 OP_PICK OP_1ADD OP_16 OP_MUL OP_8 OP_PICK OP_16 OP_MOD OP_ADD OP_0 OP_OUTPUTBYTECODE OP_13 OP_PICK OP_EQUALVERIFY OP_0 OP_OUTPUTTOKENCATEGORY OP_14 OP_PICK OP_1 OP_CAT OP_EQUALVERIFY OP_0 OP_OUTPUTTOKENAMOUNT OP_0 OP_NUMEQUALVERIFY OP_0 OP_OUTPUTVALUE OP_5 OP_PICK OP_NUMEQUALVERIFY OP_0 OP_OUTPUTTOKENCOMMITMENT OP_11 OP_PICK OP_3 OP_PICK OP_CAT 00 OP_CAT OP_2 OP_PICK OP_1 OP_NUM2BIN OP_CAT OP_EQUALVERIFY OP_1 OP_BEGIN OP_DUP OP_OUTPUTTOKENCATEGORY OP_0 OP_EQUALVERIFY OP_DUP OP_OUTPUTBYTECODE OP_14 OP_PICK OP_EQUAL OP_NOT OP_VERIFY OP_DUP OP_1ADD OP_NIP OP_DUP OP_TXOUTPUTCOUNT OP_GREATERTHANOREQUAL OP_UNTIL OP_2DROP OP_2DROP OP_2DROP OP_2DROP OP_2DROP OP_2DROP OP_ENDIF OP_2DROP OP_2DROP OP_1 OP_ELSE OP_SWAP OP_2 OP_NUMEQUALVERIFY OP_INPUTINDEX OP_0 OP_NUMEQUALVERIFY OP_0 OP_UTXOTOKENCATEGORY OP_OVER OP_1 OP_CAT OP_EQUALVERIFY OP_0 OP_UTXOTOKENAMOUNT OP_0 OP_NUMEQUALVERIFY OP_0 OP_UTXOBYTECODE OP_1 OP_BEGIN OP_DUP OP_UTXOBYTECODE OP_2 OP_PICK OP_EQUAL OP_NOT OP_VERIFY OP_DUP OP_1ADD OP_NIP OP_DUP OP_TXINPUTCOUNT OP_GREATERTHANOREQUAL OP_UNTIL OP_0 OP_UTXOTOKENCOMMITMENT OP_DUP OP_SIZE OP_NIP 27 OP_NUMEQUALVERIFY OP_DUP OP_1 OP_SPLIT OP_DROP OP_5 OP_EQUALVERIFY OP_DUP OP_1 OP_SPLIT OP_NIP 14 OP_SPLIT OP_DROP OP_OVER 25 OP_SPLIT OP_NIP OP_1 OP_SPLIT OP_DROP OP_BIN2NUM 000040 OP_ADD OP_CHECKSEQUENCEVERIFY OP_DROP 76a914 OP_SWAP OP_CAT 88ac OP_CAT OP_1 OP_UTXOBYTECODE OP_1 OP_UTXOTOKENCATEGORY OP_0 OP_EQUALVERIFY OP_DUP OP_SIZE OP_NIP 19 OP_NUMEQUALVERIFY OP_DUP OP_3 OP_SPLIT OP_DROP 76a914 OP_EQUALVERIFY OP_DUP 17 OP_SPLIT OP_NIP 88ac OP_EQUALVERIFY OP_2DUP OP_EQUAL OP_SWAP OP_HASH160 OP_12 OP_SPLIT OP_DROP OP_3 OP_PICK 15 OP_SPLIT OP_NIP OP_12 OP_SPLIT OP_DROP OP_EQUAL OP_BOOLOR OP_VERIFY OP_0 OP_OUTPUTBYTECODE OP_EQUALVERIFY OP_0 OP_OUTPUTTOKENCATEGORY OP_4 OP_ROLL OP_EQUALVERIFY OP_0 OP_OUTPUTTOKENAMOUNT OP_0 OP_NUMEQUALVERIFY OP_0 OP_OUTPUTTOKENCOMMITMENT OP_EQUALVERIFY OP_0 OP_OUTPUTVALUE OP_0 OP_UTXOVALUE OP_NUMEQUALVERIFY OP_TXOUTPUTCOUNT OP_1 OP_GREATERTHAN OP_IF OP_1 OP_BEGIN OP_DUP OP_OUTPUTTOKENCATEGORY OP_0 OP_EQUALVERIFY OP_DUP OP_OUTPUTBYTECODE OP_3 OP_PICK OP_EQUAL OP_NOT OP_VERIFY OP_DUP OP_1ADD OP_NIP OP_DUP OP_TXOUTPUTCOUNT OP_GREATERTHANOREQUAL OP_UNTIL OP_DROP OP_ENDIF OP_2DROP OP_1 OP_ENDIF OP_ENDIF",
  source: "pragma cashscript ^0.13.0;\n// Focus Forest v5. Every tree NFT stays in this contract until its owner claims it.\n// Commitment (39 bytes):\n//   0x05 | owner pkh (20) | planter tag (12) | stamp (4) | 512-second units (1) | look (1)\n// look = tier * 16 + species.\n//   Tiers by verified focus lock: 1 Sprout (>= 1 unit, 8.5 min), 2 Tree (>= 3 units, 25.6 min),\n//   3 Big Tree (>= 6 units, 51.2 min), 4 House (>= 11 units, 93.9 min).\n//   Species 1..6 (oak, cherry, pine, maple, birch, cash) are the planter's chosen style.\n// Merges keep the value: 3 Sprouts -> Tree, 2 Trees -> Big Tree, 2 Big Trees -> House.\n// planter tag = first 12 bytes of hash160(app wallet locking bytecode); only that wallet may merge.\n// stamp = planting time (unsigned 32-bit, caller-supplied metadata; indexers rank by block time),\n// or a lineage fingerprint of the burned trees for merges.\n// Deposits always follow the tree: a merge keeps the sum of its ingredients' values, and a claim\n// releases the full value to the owner. Only the owner or the planting app wallet may claim.\ncontract FocusForest(bytes32 categoryId) {\n    function plantTree(int plantedAt, int units, int tier, int species, bytes20 ownerPkh) {\n        require(this.activeInputIndex == 0);\n        require(units >= 1 && units <= 24);\n        require(species >= 1 && species <= 6);\n        require(tier >= 1 && tier <= 4);\n        // Every tier needs its own minimum focus lock.\n        if (tier == 4) { require(units >= 11); }\n        else if (tier == 3) { require(units >= 6); }\n        else if (tier == 2) { require(units >= 3); }\n        // Unsigned 32-bit seconds; bytes4() alone would reject values from 2^31 (January 2038).\n        require(plantedAt >= 500000000 && plantedAt <= 4294967295);\n        bytes stamp = bytes5(plantedAt).split(4)[0];\n        require(tx.inputs[0].tokenCategory == categoryId + 0x02);\n        require(tx.inputs[0].nftCommitment == 0x);\n        require(tx.inputs[0].tokenAmount == 0);\n        require(tx.outputs.length >= 2);\n        require(tx.outputs[0].lockingBytecode == tx.inputs[0].lockingBytecode);\n        require(tx.outputs[0].tokenCategory == tx.inputs[0].tokenCategory);\n        require(tx.outputs[0].nftCommitment == 0x);\n        require(tx.outputs[0].tokenAmount == 0);\n        require(tx.outputs[0].value == tx.inputs[0].value);\n        require(tx.inputs[1].tokenCategory == 0x);\n        // No other input may come from this contract, so no tree can be burned here.\n        int p = 1;\n        do {\n            require(tx.inputs[p].lockingBytecode != tx.inputs[0].lockingBytecode);\n            p = p + 1;\n        } while (p < tx.inputs.length);\n        bytes planter = tx.inputs[1].lockingBytecode;\n        require(planter.length == 25);\n        require(planter.split(3)[0] == 0x76a914);\n        require(planter.split(23)[1] == 0x88ac);\n        // Rewards belong to a separate owner, never the paying app wallet.\n        require(planter.split(3)[1].split(20)[0] != ownerPkh);\n        bytes tag = hash160(planter).split(12)[0];\n        require(tx.outputs[1].lockingBytecode == tx.inputs[0].lockingBytecode);\n        require(tx.outputs[1].tokenCategory == categoryId + 0x01);\n        require(tx.outputs[1].tokenAmount == 0);\n        require(tx.outputs[1].value >= 1000);\n        require(tx.outputs[1].nftCommitment == 0x05 + ownerPkh + tag + stamp + bytes1(units) + bytes1(tier * 16 + species));\n        if (tx.outputs.length > 2) {\n            int o = 2;\n            do {\n                require(tx.outputs[o].tokenCategory == 0x);\n                require(tx.outputs[o].lockingBytecode != tx.inputs[0].lockingBytecode);\n                o = o + 1;\n            } while (o < tx.outputs.length);\n        }\n    }\n\n    // Every tree input runs this function and proves its own lock has matured.\n    // Input 0 also checks the ingredients, the planter's signing input and the result.\n    function mergeTrees() {\n        bytes self = tx.inputs[this.activeInputIndex].lockingBytecode;\n        bytes own = tx.inputs[this.activeInputIndex].nftCommitment;\n        require(own.length == 39);\n        int ownUnits = int(own.split(37)[1].split(1)[0]);\n        require(this.age >= 4194304 + ownUnits);\n        // Input 0 must be a tree running this same merge (plant and claim forbid extra contract inputs).\n        require(tx.inputs[0].lockingBytecode == self);\n        require(tx.inputs[0].tokenCategory == categoryId + 0x01);\n        require(tx.inputs[0].nftCommitment.length == 39);\n        require(this.activeInputIndex < tx.inputs.length - 1);\n        require(tx.outputs.length >= 2);\n        if (this.activeInputIndex == 0) {\n            bytes head = own.split(33)[0];\n            require(head.split(1)[0] == 0x05);\n            bytes tag = head.split(21)[1];\n            int look = int(own.split(38)[1]);\n            int tier = look / 16;\n            require(tier >= 1 && tier <= 3);\n            int count = 2;\n            if (tier == 1) { count = 3; }\n            require(tx.inputs.length == count + 1);\n            bytes lineage = 0x;\n            int deposits = 0;\n            int i = 0;\n            do {\n                bytes entry = tx.inputs[i].nftCommitment;\n                require(tx.inputs[i].lockingBytecode == self);\n                require(tx.inputs[i].tokenCategory == categoryId + 0x01);\n                require(tx.inputs[i].tokenAmount == 0);\n                require(entry.length == 39);\n                // Same owner, same planting wallet and same tier for every ingredient.\n                require(entry.split(33)[0] == head);\n                require(int(entry.split(38)[1]) / 16 == tier);\n                lineage = lineage + entry;\n                deposits = deposits + tx.inputs[i].value;\n                i = i + 1;\n            } while (i < count);\n            // The app wallet that planted the trees must sign its funding input.\n            bytes planter = tx.inputs[count].lockingBytecode;\n            require(tx.inputs[count].tokenCategory == 0x);\n            require(planter.length == 25);\n            require(planter.split(3)[0] == 0x76a914);\n            require(planter.split(23)[1] == 0x88ac);\n            require(hash160(planter).split(12)[0] == tag);\n            bytes stamp = hash256(lineage).split(4)[0];\n            int result = (tier + 1) * 16 + look % 16;\n            require(tx.outputs[0].lockingBytecode == self);\n            require(tx.outputs[0].tokenCategory == categoryId + 0x01);\n            require(tx.outputs[0].tokenAmount == 0);\n            // The merged tree carries every ingredient's deposit; the planter only pays the fee.\n            require(tx.outputs[0].value == deposits);\n            require(tx.outputs[0].nftCommitment == head + stamp + 0x00 + bytes1(result));\n            int o = 1;\n            do {\n                require(tx.outputs[o].tokenCategory == 0x);\n                require(tx.outputs[o].lockingBytecode != self);\n                o = o + 1;\n            } while (o < tx.outputs.length);\n        }\n    }\n\n    function claimTree() {\n        require(this.activeInputIndex == 0);\n        require(tx.inputs[0].tokenCategory == categoryId + 0x01);\n        require(tx.inputs[0].tokenAmount == 0);\n        bytes self = tx.inputs[0].lockingBytecode;\n        int c = 1;\n        do {\n            require(tx.inputs[c].lockingBytecode != self);\n            c = c + 1;\n        } while (c < tx.inputs.length);\n        bytes commitment = tx.inputs[0].nftCommitment;\n        require(commitment.length == 39);\n        require(commitment.split(1)[0] == 0x05);\n        bytes20 ownerPkh = bytes20(commitment.split(1)[1].split(20)[0]);\n        int units = int(commitment.split(37)[1].split(1)[0]);\n        // BIP68 time flag; consensus measures age from confirmation using MTP.\n        require(this.age >= 4194304 + units);\n        // Only the owner or the planting app wallet may release a tree, so nobody else can\n        // pull matured trees out before their planter merges them. Spending a P2PKH input\n        // requires that key's signature.\n        bytes owner = new LockingBytecodeP2PKH(ownerPkh);\n        bytes payer = tx.inputs[1].lockingBytecode;\n        require(tx.inputs[1].tokenCategory == 0x);\n        require(payer.length == 25);\n        require(payer.split(3)[0] == 0x76a914);\n        require(payer.split(23)[1] == 0x88ac);\n        require(payer == owner || hash160(payer).split(12)[0] == commitment.split(21)[1].split(12)[0]);\n        require(tx.outputs[0].lockingBytecode == owner);\n        require(tx.outputs[0].tokenCategory == categoryId);\n        require(tx.outputs[0].tokenAmount == 0);\n        require(tx.outputs[0].nftCommitment == commitment);\n        require(tx.outputs[0].value == tx.inputs[0].value);\n        if (tx.outputs.length > 1) {\n            int o = 1;\n            do {\n                require(tx.outputs[o].tokenCategory == 0x);\n                require(tx.outputs[o].lockingBytecode != self);\n                o = o + 1;\n            } while (o < tx.outputs.length);\n        }\n    }\n}\n",
  debug: {
    bytecode: "78009c63c0009d537951a254790118a19a69557951a2567956a19a69547951a2557954a19a695479549c6353795ba269675479539c63537956a269675479529c63537953a2696868685279040065cd1da2537905ffffffff00a19a697b5580547f7500ce5279527e8800cf008800d0009dc452a26900cd00c78800d100ce8800d2008800d3009d00cc00c69d51ce0088516576c700c7879169768b7776c3a26651c776827701199d76537f750376a914887601177f770288ac8876537f7701147f755979879169a95c7f7551cd00c78851d1547a517e8851d3009d51cc02e803a26951d255597a7e7b7e537a7e547a51807e547a6095557a9351807e88c452a063526576d1008876cd00c7879169768b7776c4a26675686d516778519c63c0c7c0cf76827701279d7601257f77517f75810300004093b27500c752798800ce5379517e8800cf827701279dc0c38c9f69c452a269c0009c637601217f7576517f7555887601157f77527901267f77817660967651a27853a19a695278519c63755368c3788b9d0000006576cf78c75b798878ce5c79517e8878d0009d76827701279d7601217f755979887601267f7781609656799d5379787e547a757c6b7c6b7c6c6c52795279c693537a757c6b7c6c788b7b7577765479a2665379c75479ce008876827701199d76537f750376a914887601177f770288ac8876a95c7f755879885379aa547f7556798b6095587960979300cd5d798800d15e79517e8800d3009d00cc55799d00d25b7953797e01007e527951807e88516576d1008876cd5e79879169768b7776c4a2666d6d6d6d6d6d686d6d51677c529dc0009d00ce78517e8800d0009d00c7516576c75279879169768b7776c3a26600cf76827701279d76517f75558876517f7701147f757801257f77517f75810300004093b2750376a9147c7e0288ac7e51c751ce008876827701199d76537f750376a914887601177f770288ac886e877ca95c7f75537901157f775c7f75879b6900cd8800d1547a8800d3009d00d28800cc00c69dc451a063516576d1008876cd5379879169768b7776c4a26675686d516868",
    sourceMap: "16:4:64:5;;;;17:16:17:37;:41::42;:8::44:1;18:16:18:21:0;;:25::26;:16:::1;:30::35:0;;:39::41;:30:::1;:16;:8::43;19:16:19:23:0;;:27::28;:16:::1;:32::39:0;;:43::44;:32:::1;:16;:8::46;20:16:20:20:0;;:24::25;:16:::1;:29::33:0;;:37::38;:29:::1;:16;:8::40;22:12:22:16:0;;:20::21;:12:::1;:23::48:0;:33::38;;:42::44;:33:::1;:25::46;23:13:24:52:0;:17:23:21;;:25::26;:17:::1;:28::52:0;:38::43;;:47::48;:38:::1;:30::50;24:13:24:52:0;:17::21;;:25::26;:17:::1;:28::52:0;:38::43;;:47::48;:38:::1;:30::50;:28::52;:13;23;26:16:26:25:0;;:29::38;:16:::1;:42::51:0;;:55::65;:42:::1;:16;:8::67;27:29:27:38:0;:22::39:1;;:46::47:0;:22::48:1;:::51;28:26:28:27:0;:16::42:1;:46::56:0;;:59::63;:46:::1;:8::65;29:26:29:27:0;:16::42:1;:46::48:0;:8::50:1;30:26:30:27:0;:16::40:1;:44::45:0;:8::47:1;31:16:31:33:0;:37::38;:16:::1;:8::40;32:27:32:28:0;:16::45:1;:59::60:0;:49::77:1;:8::79;33:27:33:28:0;:16::43:1;:57::58:0;:47::73:1;:8::75;34:27:34:28:0;:16::43:1;:47::49:0;:8::51:1;35:27:35:28:0;:16::41:1;:45::46:0;:8::48:1;36:27:36:28:0;:16::35:1;:49::50:0;:39::57:1;:8::59;37:26:37:27:0;:16::42:1;:46::48:0;:8::50:1;39:16:39:17:0;40:8:43:39;41:30:41:31;:20::48:1;:62::63:0;:52::80:1;:20;;:12::82;42:16:42:17:0;:::21:1;:12::22;43:17:43:18:0;:21::37;40:8::39:1;;44:34:44:35:0;:24::52:1;45:16:45:23:0;:::30:1;;:34::36:0;:8::38:1;46:16:46:23:0;:30::31;:16::32:1;:::35;:39::47:0;:8::49:1;47:16:47:23:0;:30::32;:16::33:1;:::36;:40::46:0;:8::48:1;49:16:49:23:0;:30::31;:16::32:1;:::35;:42::44:0;:16::45:1;:::48;:52::60:0;;:16:::1;;:8::62;50:20:50:36;:43::45:0;:20::46:1;:::49;51:27:51:28:0;:16::45:1;:59::60:0;:49::77:1;:8::79;52:27:52:28:0;:16::43:1;:47::57:0;;:60::64;:47:::1;:8::66;53:27:53:28:0;:16::41:1;:45::46:0;:8::48:1;54:27:54:28:0;:16::35:1;:39::43:0;:16:::1;:8::45;55:27:55:28:0;:16::43:1;:47::51:0;:54::62;;:47:::1;:65::68:0;:47:::1;:71::76:0;;:47:::1;:86::91:0;;:79::92:1;;:47;:102::106:0;;:109::111;:102:::1;:114::121:0;;:102:::1;:95::122;;:47;:8::124;56:12:56:29:0;:32::33;:12:::1;:35:63:9:0;57:20:57:21;58:12:62:44;59:35:59:36;:24::51:1;:55::57:0;:16::59:1;60:35:60:36:0;:24::53:1;:67::68:0;:57::85:1;:24;;:16::87;61:20:61:21:0;:::25:1;:16::26;62:21:62:22:0;:25::42;58:12::44:1;;56:35:63:9;;16:4:64:5;;;68::128::0;;;;69:31:69:52;:21::69:1;70:30:70:51:0;:20::66:1;71:16:71:19:0;:::26:1;;:30::32:0;:8::34:1;72:27:72:30:0;:37::39;:27::40:1;:::43;:50::51:0;:27::52:1;:::55;:23::56;73:28:73:35:0;:::46:1;:8::48;;75:26:75:27:0;:16::44:1;:48::52:0;;:8::54:1;76:26:76:27:0;:16::42:1;:46::56:0;;:59::63;:46:::1;:8::65;77:26:77:27:0;:16::42:1;:::49;;:53::55:0;:8::57:1;78:16:78:37:0;:40::56;:::60:1;:16;:8::62;79:16:79:33:0;:37::38;:16:::1;:8::40;80:12:80:33:0;:37::38;:12:::1;:40:127:9:0;81:25:81:28;:35::37;:25::38:1;:::41;82:20:82:24:0;:31::32;:20::33:1;:::36;:40::44:0;:12::46:1;83:24:83:28:0;:35::37;:24::38:1;:::41;84:27:84:30:0;;:37::39;:27::40:1;:::43;:23::44;85::85:27:0;:30::32;:23:::1;86:20:86:24:0;:28::29;:20:::1;:33::37:0;:41::42;:33:::1;:20;:12::44;87:24:87:25:0;88:16:88:20;:24::25;:16:::1;:27::41:0;:29::39:1;;:27::41;89:20:89:36:0;:40::45;:::49:1;:12::51;90:28:90:30:0;91:27:91:28;92:20:92:21;93:12:105:32;94:40:94:41;:30::56:1;95:34:95:35:0;:24::52:1;:56::60:0;;:16::62:1;96:34:96:35:0;:24::50:1;:54::64:0;;:67::71;:54:::1;:16::73;97:34:97:35:0;:24::48:1;:52::53:0;:16::55:1;98:24:98:29:0;:::36:1;;:40::42:0;:16::44:1;100:24:100:29:0;:36::38;:24::39:1;:::42;:46::50:0;;:16::52:1;101:28:101:33:0;:40::42;:28::43:1;:::46;:24::47;:50::52:0;:24:::1;:56::60:0;;:16::62:1;102:26:102:33:0;;:36::41;:26:::1;:16::42;;;;;;;;;;103:27:103:35:0;;:48::49;;:38::56:1;:27;:16::57;;;;;;;104:20:104:21:0;:::25:1;:16::26;;93:15:105:13;105:21::22:0;:25::30;;93:12::32:1;;107:38:107:43:0;;:28::60:1;108:30:108:35:0;;:20::50:1;:54::56:0;:12::58:1;109:20:109:27:0;:::34:1;;:38::40:0;:12::42:1;110:20:110:27:0;:34::35;:20::36:1;:::39;:43::51:0;:12::53:1;111:20:111:27:0;:34::36;:20::37:1;:::40;:44::50:0;:12::52:1;112:28:112:35:0;:20::36:1;:43::45:0;:20::46:1;:::49;:53::56:0;;:12::58:1;113:34:113:41:0;;:26::42:1;:49::50:0;:26::51:1;:::54;114::114:30:0;;:::34:1;:38::40:0;:25:::1;:43::47:0;;:50::52;:43:::1;:25;115:31:115:32:0;:20::49:1;:53::57:0;;:12::59:1;116:31:116:32:0;:20::47:1;:51::61:0;;:64::68;:51:::1;:12::70;117:31:117:32:0;:20::45:1;:49::50:0;:12::52:1;119:31:119:32:0;:20::39:1;:43::51:0;;:12::53:1;120:31:120:32:0;:20::47:1;:51::55:0;;:58::63;;:51:::1;:66::70:0;:51:::1;:80::86:0;;:73::87:1;;:51;:12::89;121:20:121:21:0;122:12:126:44;123:35:123:36;:24::51:1;:55::57:0;:16::59:1;124:35:124:36:0;:24::53:1;:57::61:0;;:24:::1;;:16::63;125:20:125:21:0;:::25:1;:16::26;126:21:126:22:0;:25::42;122:12::44:1;;80:40:127:9;;;;;;;68:4:128:5;;;;130::170::0;;;131:16:131:37;:41::42;:8::44:1;132:26:132:27:0;:16::42:1;:46::56:0;:59::63;:46:::1;:8::65;133:26:133:27:0;:16::40:1;:44::45:0;:8::47:1;134:31:134:32:0;:21::49:1;135:16:135:17:0;136:8:139:39;137:30:137:31;:20::48:1;:52::56:0;;:20:::1;;:12::58;138:16:138:17:0;:::21:1;:12::22;139:17:139:18:0;:21::37;136:8::39:1;;140:37:140:38:0;:27::53:1;141:16:141:26:0;:::33:1;;:37::39:0;:8::41:1;142:16:142:26:0;:33::34;:16::35:1;:::38;:42::46:0;:8::48:1;143:35:143:45:0;:52::53;:35::54:1;:::57;:64::66:0;:35::67:1;:::70;144:24:144:34:0;:41::43;:24::44:1;:::47;:54::55:0;:24::56:1;:::59;:20::60;146:28:146:35:0;:::43:1;:8::45;;150:22:150:56:0;:47::55;:22::56:1;;;151:32:151:33:0;:22::50:1;152:26:152:27:0;:16::42:1;:46::48:0;:8::50:1;153:16:153:21:0;:::28:1;;:32::34:0;:8::36:1;154:16:154:21:0;:28::29;:16::30:1;:::33;:37::45:0;:8::47:1;155:16:155:21:0;:28::30;:16::31:1;:::34;:38::44:0;:8::46:1;156:16:156:30:0;::::1;:42::47:0;:34::48:1;:55::57:0;:34::58:1;:::61;:65::75:0;;:82::84;:65::85:1;:::88;:95::97:0;:65::98:1;:::101;:34;:16;:8::103;157:27:157:28:0;:16::45:1;:8::56;158:27:158:28:0;:16::43:1;:47::57:0;;:8::59:1;159:27:159:28:0;:16::41:1;:45::46:0;:8::48:1;160:27:160:28:0;:16::43:1;:8::59;161:27:161:28:0;:16::35:1;:49::50:0;:39::57:1;:8::59;162:12:162:29:0;:32::33;:12:::1;:35:169:9:0;163:20:163:21;164:12:168:44;165:35:165:36;:24::51:1;:55::57:0;:16::59:1;166:35:166:36:0;:24::53:1;:57::61:0;;:24:::1;;:16::63;167:20:167:21:0;:::25:1;:16::26;168:21:168:22:0;:25::42;164:12::44:1;;162:35:169:9;;130:4:170:5;;15:0:171:1;",
    logs: [],
    requires: [
      {
        ip: 7,
        line: 17
      },
      {
        ip: 17,
        line: 18
      },
      {
        ip: 27,
        line: 19
      },
      {
        ip: 37,
        line: 20
      },
      {
        ip: 47,
        line: 22
      },
      {
        ip: 58,
        line: 23
      },
      {
        ip: 69,
        line: 24
      },
      {
        ip: 82,
        line: 26
      },
      {
        ip: 95,
        line: 28
      },
      {
        ip: 99,
        line: 29
      },
      {
        ip: 103,
        line: 30
      },
      {
        ip: 107,
        line: 31
      },
      {
        ip: 112,
        line: 32
      },
      {
        ip: 117,
        line: 33
      },
      {
        ip: 121,
        line: 34
      },
      {
        ip: 125,
        line: 35
      },
      {
        ip: 130,
        line: 36
      },
      {
        ip: 134,
        line: 37
      },
      {
        ip: 143,
        line: 41
      },
      {
        ip: 157,
        line: 45
      },
      {
        ip: 163,
        line: 46
      },
      {
        ip: 169,
        line: 47
      },
      {
        ip: 181,
        line: 49
      },
      {
        ip: 190,
        line: 51
      },
      {
        ip: 197,
        line: 52
      },
      {
        ip: 201,
        line: 53
      },
      {
        ip: 206,
        line: 54
      },
      {
        ip: 233,
        line: 55
      },
      {
        ip: 243,
        line: 59
      },
      {
        ip: 250,
        line: 60
      },
      {
        ip: 275,
        line: 71
      },
      {
        ip: 286,
        line: 73
      },
      {
        ip: 292,
        line: 75
      },
      {
        ip: 299,
        line: 76
      },
      {
        ip: 305,
        line: 77
      },
      {
        ip: 310,
        line: 78
      },
      {
        ip: 314,
        line: 79
      },
      {
        ip: 328,
        line: 82
      },
      {
        ip: 349,
        line: 86
      },
      {
        ip: 361,
        line: 89
      },
      {
        ip: 372,
        line: 95
      },
      {
        ip: 379,
        line: 96
      },
      {
        ip: 383,
        line: 97
      },
      {
        ip: 388,
        line: 98
      },
      {
        ip: 395,
        line: 100
      },
      {
        ip: 405,
        line: 101
      },
      {
        ip: 450,
        line: 108
      },
      {
        ip: 455,
        line: 109
      },
      {
        ip: 461,
        line: 110
      },
      {
        ip: 467,
        line: 111
      },
      {
        ip: 475,
        line: 112
      },
      {
        ip: 496,
        line: 115
      },
      {
        ip: 503,
        line: 116
      },
      {
        ip: 507,
        line: 117
      },
      {
        ip: 512,
        line: 119
      },
      {
        ip: 527,
        line: 120
      },
      {
        ip: 533,
        line: 123
      },
      {
        ip: 540,
        line: 124
      },
      {
        ip: 564,
        line: 131
      },
      {
        ip: 570,
        line: 132
      },
      {
        ip: 574,
        line: 133
      },
      {
        ip: 585,
        line: 137
      },
      {
        ip: 599,
        line: 141
      },
      {
        ip: 605,
        line: 142
      },
      {
        ip: 623,
        line: 146
      },
      {
        ip: 635,
        line: 152
      },
      {
        ip: 640,
        line: 153
      },
      {
        ip: 646,
        line: 154
      },
      {
        ip: 652,
        line: 155
      },
      {
        ip: 670,
        line: 156
      },
      {
        ip: 673,
        line: 157
      },
      {
        ip: 678,
        line: 158
      },
      {
        ip: 682,
        line: 159
      },
      {
        ip: 685,
        line: 160
      },
      {
        ip: 690,
        line: 161
      },
      {
        ip: 700,
        line: 165
      },
      {
        ip: 707,
        line: 166
      }
    ]
  },
  compiler: {
    name: "cashc",
    version: "0.13.0-next.1"
  },
  updatedAt: "2026-11-18T19:32:28.559Z"
} as const;