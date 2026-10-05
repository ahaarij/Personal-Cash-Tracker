/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "w8ztnwqofaykkss",
    "created": "2026-09-28 10:44:46.204Z",
    "updated": "2026-09-28 10:44:46.204Z",
    "name": "trips",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "6iuxn3lw",
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
        "id": "ve8dftg4",
        "name": "name",
        "type": "text",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "min": 1,
          "max": 120,
          "pattern": ""
        }
      },
      {
        "system": false,
        "id": "0m5allph",
        "name": "start_date",
        "type": "text",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": 10,
          "pattern": ""
        }
      },
      {
        "system": false,
        "id": "ekqtauhf",
        "name": "end_date",
        "type": "text",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": 10,
          "pattern": ""
        }
      }
    ],
    "indexes": [],
    "listRule": "@request.auth.id != '' && owner = @request.auth.id",
    "viewRule": "@request.auth.id != '' && owner = @request.auth.id",
    "createRule": "@request.auth.id != ''",
    "updateRule": "@request.auth.id != '' && owner = @request.auth.id",
    "deleteRule": "@request.auth.id != '' && owner = @request.auth.id",
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("w8ztnwqofaykkss");

  return dao.deleteCollection(collection);
})
