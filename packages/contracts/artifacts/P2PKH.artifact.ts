export default {
  contractName: "PomodoroRewardPool",
  constructorInputs: [
    {
      name: "manager",
      type: "pubkey"
    }
  ],
  abi: [
    {
      name: "Mint",
      inputs: [
        {
          name: "managerSig",
          type: "sig"
        }
      ]
    },
    {
      name: "lockSession",
      inputs: []
    }
  ],
  bytecode: "OP_OVER OP_0 OP_NUMEQUAL OP_IF OP_ROT OP_SWAP OP_CHECKSIG OP_NIP OP_ELSE OP_SWAP OP_1 OP_NUMEQUALVERIFY OP_DROP OP_1 OP_ENDIF",
  source: "pragma cashscript ^0.12.0;\n\ncontract PomodoroRewardPool(\n    pubkey manager,\n) {\n\n    function Mint(sig managerSig) {\n        require(checkSig(managerSig, manager));\n    }\n\n    function lockSession() {\n        require(true);\n    }\n}\n",
  debug: {
    bytecode: "78009c637b7cac77677c519d755168",
    sourceMap: "7:4:9:5;;;;8:25:8:35;:37::44;:8::47:1;7:4:9:5;;11::13::0;;;::::1;;3:0:14:1",
    logs: [],
    requires: [
      {
        ip: 8,
        line: 8
      },
      {
        ip: 14,
        line: 12
      }
    ]
  },
  compiler: {
    name: "cashc",
    version: "0.12.0"
  },
  updatedAt: "2025-11-20T06:10:57.501Z"
} as const;