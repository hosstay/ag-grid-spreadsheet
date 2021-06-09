const util = require('../utility');

const COSMETIC_ID = 'grid_specific_id';
const ID = 'id';

function getStyleTableName(table) {
  const hasNumPos = table.search(/_\d$/);

  if (hasNumPos !== -1) {
    return table.substring(0, hasNumPos) + '_style' + table.substring(hasNumPos);
  } else {
    return table + '_style';
  }
}

function getDistinctTablesFromColumnTable(columnTable) {
  const distinctTables = [];

  columnTable.forEach((column) => {
    let dup = false;

    distinctTables.forEach((table) => {
      if (column.table_name === table) {
        dup = true;
      }
    });

    if (!dup) {
      distinctTables.push(column.table_name);
    }
  });

  return distinctTables;
}

function isColumnInTable(column, tableName, columnTable) {
  let add = false;

  for (let i = 0; i < columnTable.length; i++) {
    if (column === columnTable[i].column_name) {
      if (tableName === columnTable[i].table_name) {
        add = true;
      }
      break;
    }
  }

  return add;
}

async function findNumberOfTables(db, dataTable) {
  const searchForNumberOfTables = async (currentTableName, numberOfTables = 0) => {
    try {
      const TABLE_SEARCH_QUERY = `SELECT to_regclass('${currentTableName}');`;

      const results = await db.query(TABLE_SEARCH_QUERY);
      if (results[0].to_regclass === null) return numberOfTables;

      numberOfTables++;

      const pos = currentTableName.search(/_\d+/);
      if (pos !== -1) {
        let num = parseInt(currentTableName.slice(pos + 1, currentTableName.length));
        num++;
        currentTableName = currentTableName.replace(/_\d+/, '_' + num);
      } else {
        currentTableName += '_2';
      }

      const result = await searchForNumberOfTables(currentTableName, numberOfTables);

      return result;
    } catch (err) {
      return util.errorHandler(err, 'searchForNumberOfTables');
    }
  };

  try {
    const result = await searchForNumberOfTables(dataTable);

    return result ? result : false;
  } catch (err) {
    return util.errorHandler(err, 'findNumberOfTables', true);
  }
}

async function getColumnTable(db, COLUMN_TABLE) {
  try {
    let query = `SELECT to_regclass('${COLUMN_TABLE}');`;
    let results = await db.query(query);
    if (results[0].to_regclass === null) throw 'No column table';

    query = `SELECT * FROM ${COLUMN_TABLE} ORDER BY id;`;
    results = await db.query(query);
    if (!results) throw 'No columns in column table';

    return results;
  } catch (err) {
    return util.errorHandler(err, 'getColumnTable', true);
  }
}

async function getDataRecord(db, grid, id, numberOfTables) {
  try {
    numberOfTables = numberOfTables === undefined ? await findNumberOfTables(db, grid) : numberOfTables;

    let selectQuery = 'SELECT *\nFROM\n';

    for (let i = 1; i <= numberOfTables; i++) {
      if (i === 1) {
        selectQuery += `\t${grid}\n`;
      } else {
        selectQuery += `\t${grid}_${i} USING (${COSMETIC_ID}, ${ID})\n`;
      }

      if (i < numberOfTables) {
        selectQuery += `INNER JOIN\n`;
      } else {
        selectQuery += `WHERE ${ID} = ${id};`;
      }
    }

    return (await db.query(selectQuery))[0];
  } catch (err) {
    return util.errorHandler(err, 'getDataRecord');
  }
}

async function getStyleRecord(db, grid, id, numberOfTables) {
  try {
    numberOfTables = numberOfTables === undefined ? await findNumberOfTables(db, grid) : numberOfTables;

    let selectQuery = 'SELECT *\nFROM\n';

    for (let i = 1; i <= numberOfTables; i++) {
      if (i === 1) {
        selectQuery += `\t${grid}_style\n`;
      } else {
        selectQuery += `\t${grid}_style_${i} USING (${COSMETIC_ID}, ${ID})\n`;
      }

      if (i < numberOfTables) {
        selectQuery += `INNER JOIN\n`;
      } else {
        selectQuery += `WHERE ${ID} = ${id};`;
      }
    }

    return (await db.query(selectQuery))[0];
  } catch (err) {
    return util.errorHandler(err, 'getStyleRecord');
  }
}

async function getDataStyleConcatRecord(db, grid, id, numberOfTables) {
  try {
    numberOfTables = numberOfTables === undefined ? await findNumberOfTables(db, grid) : numberOfTables;

    let selectQuery = 'SELECT *\nFROM\n';

    for (let i = 1; i <= numberOfTables; i++) {
      if (i === 1) {
        selectQuery += `\t${grid}\n`;
      } else {
        selectQuery += `\t${grid}_${i} USING (${COSMETIC_ID}, ${ID})\n`;
      }

      selectQuery += `INNER JOIN\n`;

      if (i === 1) {
        selectQuery += `\t${grid}_style USING (${COSMETIC_ID}, ${ID})\n`;
      } else {
        selectQuery += `\t${grid}_style_${i} USING (${COSMETIC_ID}, ${ID})\n`;
      }

      if (i < numberOfTables) {
        selectQuery += `INNER JOIN\n`;
      } else {
        selectQuery += `WHERE ${ID} = ${id};`;
      }
    }

    return (await db.query(selectQuery))[0];
  } catch (err) {
    return util.errorHandler(err, 'getDataStyleConcatRecord');
  }
}

async function getColumnRecord(db, grid, colId) {
  try {
    const SELECT_QUERY = `
      SELECT *
      FROM ${grid}_columns
      WHERE column_name = '${colId}';
    `;

    return (await db.query(SELECT_QUERY))[0];
  } catch (err) {
    return util.errorHandler(err, 'getColumnRecord');
  }
}

async function getNextGridSpecificId(db, grid) {
  try {
    const query = `
      SELECT ${COSMETIC_ID}
      FROM ${grid}
      ORDER BY ${COSMETIC_ID} DESC
      LIMIT 1;
    `;

    let result = await db.query(query);
    result = result.length > 0 ? result[0][COSMETIC_ID] + 1 : 1;

    return result;
  } catch (err) {
    return util.errorHandler(err, 'getNextGridSpecificId');
  }
}

function getCorrectColumnTable(params) {
  let columnTable = '';

  if (params.altColumnTable) {
    columnTable = params.altColumnTable;
  } else {
    columnTable = params.gridName + '_columns';
  }

  return columnTable;
}

function prepObjForSql(obj) {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof obj[key] === 'string') {
      obj[key] = value.replace(/'/g, `''`);
    }
  }

  return JSON.stringify(obj);
}

function getChangesFromUpdates(updates) {
  const changes = [];

  updates.forEach((update) => {
    let add = true;
    let index = -1;

    changes.forEach((change, i) => {
      if (change[ID] === update[ID]) {
        add = false;
        index = i;
      }
    });

    if (add) {
      changes.push({
        [ID]: update[ID],
        colId: update.colId,
        gridName: update.gridName
      });
    } else {
      changes[index].colId = null;
    }
  });

  return changes;
}

async function insertChange(insertChangeObj) {
  const retry = insertChangeObj.retry === undefined ? 0 : insertChangeObj.retry;

  try {
    if (retry === 10) throw 'Ten retries failed for trying to insert change log record';

    const db = insertChangeObj.db;
    const mainTable = insertChangeObj.mainTable;
    const func = insertChangeObj.func;
    const columnAffected = insertChangeObj.columnAffected;
    const oldState = insertChangeObj.oldState;
    const newState = insertChangeObj.newState;
    const username = insertChangeObj.username;

    const MGRID_CHANGE_LOG_TABLE = 'mgrid_change_log';

    const insertQuery = `
      BEGIN;
      WITH t as (
        INSERT INTO ${MGRID_CHANGE_LOG_TABLE} (${COSMETIC_ID}, main_table, function, column_affected, old_state, new_state, username, change_date)
        SELECT ${COSMETIC_ID} + 1, ${mainTable}, ${func}, ${columnAffected}, ${oldState}, ${newState}, ${username}, now()
        FROM ${MGRID_CHANGE_LOG_TABLE} 
        ORDER BY ${COSMETIC_ID} DESC
        LIMIT 1
        RETURNING ${COSMETIC_ID}, ${ID}
      )
      INSERT INTO ${MGRID_CHANGE_LOG_TABLE}_style (${COSMETIC_ID}, ${ID})
      SELECT t.${COSMETIC_ID}, t.${ID}
      FROM t;
      COMMIT;
    `;

    await db.query(insertQuery);
  } catch (err) {
    if (retry !== 10) {
      console.log('Retrying change log insert...');
      insertChangeObj.retry = insertChangeObj.retry + 1;
      await insertChange(insertChangeObj);
    } else {
      throw err;
    }
  }
}

function convertStringWithNumbersToWords(string) {
  const convertNumToWords = (num) => {
    const digits = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    return digits[num];
  };

  for (let i = 0; i < string.length; i++) {
    if (/^\d$/.test(string[i])) {
      const regex = RegExp(string[i]);
      string = string.replace(regex, convertNumToWords(parseInt(string[i])));
    }
  }

  return string;
}

module.exports = {
  getStyleTableName: getStyleTableName,
  getDistinctTablesFromColumnTable: getDistinctTablesFromColumnTable,
  isColumnInTable: isColumnInTable,
  findNumberOfTables: findNumberOfTables,
  getColumnTable: getColumnTable,
  getDataRecord: getDataRecord,
  getStyleRecord: getStyleRecord,
  getDataStyleConcatRecord: getDataStyleConcatRecord,
  getColumnRecord: getColumnRecord,
  getNextGridSpecificId: getNextGridSpecificId,
  getCorrectColumnTable: getCorrectColumnTable,
  prepObjForSql: prepObjForSql,
  getChangesFromUpdates: getChangesFromUpdates,
  insertChange: insertChange,
  convertStringWithNumbersToWords: convertStringWithNumbersToWords
};