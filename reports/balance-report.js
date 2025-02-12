const path = require("path");
const fs = require("fs");
const utils = require("./_utils");

const OBJECT_IDS = {
   FY_MONTH: "1d63c6ac-011a-4ffd-ae15-97e5e43f2b3f",
   BALANCE: "bb9aaf02-3265-4b8c-9d9a-c0b447c2d804",
};

const QUERY_IDS = {
   MyTeamRC: "241a977c-7748-420d-9dcb-eff53e66a43f",
   MyQXRC: "2e3e423b-fcec-4221-9a9c-7a670fbba65e",
};

function GetViewDataBalanceReport(rc, fyMonth) {
   return {
      title: {
         en: "RC Balances",
         zh: "",
      },
      fnValueFormat: utils.valueFormat,
      rcType: rc,
      fyPeriod: fyMonth,
      fyOptions: [],
      items: [],
   };
}

async function GetRC(req, queryId) {
   const list = await utils.getData(req, queryId);

   const rcNames = (list || [])
      .map((rc) => rc["BASE_OBJECT.RC Name"])
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

   return rcNames;
}

async function GetFYMonths(req) {
   const cond = {
      where: {
         glue: "and",
         rules: [
            {
               key: "Status",
               rule: "equals",
               value: "1592549786113",
            },
         ],
      },
      populate: false,
      sort: [
         {
            key: "49d6fabe-46b1-4306-be61-1b27764c3b1a",
            dir: "DESC",
         },
      ],
      limit: 12,
   };

   return (await utils.getData(req, OBJECT_IDS.FY_MONTH, cond)).map(
      (item) => item["FY Per"]
   );
}

async function GetBalances(req, rc, fyPeriod, extraRules = []) {
   const cond = {
      where: {
         glue: "and",
         rules: [],
      },
      populate: true,
   };

   if (rc) {
      cond.where.rules.push({
         key: "RC Code",
         rule: "equals",
         value: rc,
      });
   }

   if (fyPeriod) {
      cond.where.rules.push({
         key: "FY Period",
         rule: "equals",
         value: fyPeriod,
      });
   }

   (extraRules || []).forEach((r) => {
      if (!r) return;

      cond.where.rules.push(r);
   });

   return await utils.getData(req, OBJECT_IDS.BALANCE, cond);
}

module.exports = {
   // GET: /template/balanceReport
   // balanceReport: (req, res) => {
   prepareData: async (AB, { rc, fyper }, req) => {
      let viewData = GetViewDataBalanceReport(rc, fyper);

      /**
       * {
       *    rcName1: sum of balances,
       *    rcName2: sum of balances,
       *    ...
       * }
       */
      const rcHash = {};

      // Pull FY month list
      viewData.fyOptions = await GetFYMonths(req);

      // Check QX Role of the user
      const RCs = await GetRC(
         req,
         viewData.rcType == "qx" // this is the rc from GET
            ? QUERY_IDS.MyQXRC
            : QUERY_IDS.MyTeamRC
      );

      // Pull Balance
      const rules = [
         {
            key: "RC Code",
            rule: "in",
            value: RCs,
         },
         {
            key: "COA Num",
            rule: "in",
            value: [3991, 3500],
         },
      ];

      const balances = await GetBalances(
         req,
         null,
         viewData.fyPeriod || viewData.fyOptions[0],
         rules
      );

      // Render UI
      // Calculate Sum
      (balances || []).forEach((gl) => {
         rcHash[gl["RC Code"]] =
            rcHash[gl["RC Code"]] == null ? 0 : rcHash[gl["RC Code"]];

         rcHash[gl["RC Code"]] += gl["Running Balance"] || 0;
      });

      // Convert to View Data
      Object.keys(rcHash).forEach((rcCode) => {
         viewData.items.push({
            title: rcCode,
            value: rcHash[rcCode],
         });
      });

      // Sort
      viewData.items = viewData.items.sort((a, b) =>
         a.title.toLowerCase().localeCompare(b.title.toLowerCase())
      );

      return viewData;
   },
   template: () => {
      return fs.readFileSync(
         path.join(__dirname, "templates", "balance-report.ejs"),
         "utf8"
      );
   },
};
