/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "i9dvqwfank5ltsv",
    "created": "2026-09-28 10:44:46.168Z",
    "updated": "2026-09-28 10:44:46.168Z",
    "name": "accounts",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "bnwvqfmj",
        "name": "owner",
        "type": "relation",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "_pb_users_auth_",
          "cascadeDelete": true,
          "minSelect": null,
          "maxSelect": 1,
          "displayFields": null
        }
      },
      {
        "system": false,
        "id": "pih9swpy",
        "name": "name",
        "type": "text",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "min": 1,
          "max": 100,
          "pattern": ""
        }
      },
      {
        "system": false,
        "id": "pwcqjmvc",
        "name": "type",
        "type": "select",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSelect": 1,
          "values": [
            "credit_card",
            "cash",
            "debit_card"
          ]
        }
      },
      {
        "system": false,
        "id": "6gtx2xak",
        "name": "currency",
        "type": "text",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "min": 3,
          "max": 3,
          "pattern": ""
        }
      },
      {
        "system": false,
        "id": "uvz8nv1m",
        "name": "opening_balance",
        "type": "number",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "min": -9999999999,
          "max": 9999999999,
          "noDecimal": false
        }
      },
      {
        "system": false,
        "id": "k1qaplyl",
        "name": "credit_limit",
        "type": "number",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": 0,
          "max": 9999999999,
          "noDecimal": false
        }
      },
      {
        "system": false,
        "id": "szi3iyjv",
        "name": "opening_utilized",
        "type": "number",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": 0,
          "max": 9999999999,
          "noDecimal": false
        }
      },
      {
        "system": false,
        "id": "fpc97cba",
        "name": "archived",
        "type": "bool",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {}
      },
      {
        "system": false,
        "id": "wgg9mzt4",
        "name": "sort_order",
        "type": "number",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": 0,
          "max": 9999,
          "noDecimal": false
        }
      }
    ],
    "indexes": [],
    "listRule": "@request.auth.id != '' && owner = @request.auth.id",
    "viewRule": "@request.auth.id != '' && owner = @request.auth.id",
    "createRule": "@request.auth.id != ''",
    "updateRule": "@request.auth.id != '' && owner = @request.auth.id",
    "deleteRule": null,
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("i9dvqwfank5ltsv");

  return dao.deleteCollection(collection);
})
