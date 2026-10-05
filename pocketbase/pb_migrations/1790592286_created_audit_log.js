/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "kblsqas2evl1798",
    "created": "2026-09-28 10:44:46.251Z",
    "updated": "2026-09-28 10:44:46.251Z",
    "name": "audit_log",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "qw5h51i8",
        "name": "user",
        "type": "text",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": 36,
          "pattern": ""
        }
      },
      {
        "system": false,
        "id": "0a5dxzr6",
        "name": "session_id",
        "type": "text",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": 36,
          "pattern": ""
        }
      },
      {
        "system": false,
        "id": "xoddbrsk",
        "name": "ip",
        "type": "text",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": 45,
          "pattern": ""
        }
      },
      {
        "system": false,
        "id": "ammqheue",
        "name": "action",
        "type": "text",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": 80,
          "pattern": ""
        }
      },
      {
        "system": false,
        "id": "jod7j864",
        "name": "target_record",
        "type": "text",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": 36,
          "pattern": ""
        }
      },
      {
        "system": false,
        "id": "y5fymhrt",
        "name": "result",
        "type": "select",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSelect": 1,
          "values": [
            "success",
            "failure"
          ]
        }
      }
    ],
    "indexes": [],
    "listRule": null,
    "viewRule": null,
    "createRule": null,
    "updateRule": null,
    "deleteRule": null,
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("kblsqas2evl1798");

  return dao.deleteCollection(collection);
})
