const debug = require('../utility/ag-grid-spreadsheet/debug');
const security = require('../utility/ag-grid-spreadsheet/security');
const util = require('../utility/ag-grid-spreadsheet/utility');
const gridGeneral = require('../utility/ag-grid-spreadsheet/general');

const Database = require('../database/database');
const GlobalExpressionCache = require('../utility/ag-grid-spreadsheet/global-expression-cache');

const MAX_COLUMNS_PER_TABLE = 200;
const MAX_CHARACTERS_PER_DATA = 200;
const MAX_CHARACTERS_PER_STYLE = 200;
const MAX_CHARACTERS_PER_HEADER_NAME = 51;

const COSMETIC_ID = 'grid_specific_id';
const ID = 'id';

const DEFAULT_ERROR_MESSAGE = 'An error occurred. Refresh the page.';

const db = new Database();
const cache = new GlobalExpressionCache();

let postgresqlOwner = 'mdx';

async function getRows(req, res) {
  const resolveAllExpressionStatements = async (req, COLUMN_TABLE, rData) => {
    const resolveExpressionStatements = async (req, COLUMN_TABLE, numberOfTables, expression, rowData, columnDefs, recursionCounter = 0) => {
      const getColumnRange = async (columnDefs, firstColumn, secondColumn) => {
        try {
          let i = 1;
          const columns = [];
          let addFlag = false;
          let endFlag = false;

          do {
            if (columnDefs[i].column_name === firstColumn ||
               columnDefs[i].column_name === secondColumn) {
              if (!addFlag) {
                addFlag = true;

                if (firstColumn === secondColumn) {
                  endFlag = true;
                }
              } else {
                addFlag = false;
                endFlag = true;
              }
            }

            if (addFlag || endFlag) {
              columns.push(columnDefs[i].column_name);
            }

            if (i >= columnDefs.length - 1 &&
              firstColumn !== columnDefs[columnDefs.length - 1].column_name &&
              secondColumn !== columnDefs[columnDefs.length - 1].column_name) {
              endFlag = true;
              throw 'Error: End of columnDefs reached without finding match.';
            } else if (i >= columnDefs.length - 1) {
              columns.push(columnDefs[i].column_name);
              endFlag = true;
            }

            if (firstColumn === 'ERROR' || secondColumn === 'ERROR') {
              endFlag = true;
              throw 'firstColumn = ERROR or secondColumn = ERROR';
            }

            i++;
          } while (!endFlag);

          return columns;
        } catch (err) {
          return util.errorHandler({err: err, context: 'getColumnRange'});
        }
      };

      const getColIdPair = (value) => {
        try {
          const pair = {col: '', id: ''};

          // search for split between Column name and Id
          const posOfColIdSplit = value.search(/[\d]+$/);
          const hasColIdSplit = posOfColIdSplit !== -1;
          if (hasColIdSplit) {
            // get left and right sides
            pair.col = value.slice(0, posOfColIdSplit).toLowerCase();
            pair.id = value.slice(posOfColIdSplit, value.length);
          } else {
            throw `There wasn't a correct split between column name and Id`;
          }

          return pair;
        } catch (err) {
          return util.errorHandler({err: err, context: 'getColIdPair'});
        }
      };

      const getValueOfColIdPair = async (req, COLUMN_TABLE, col, id, rowData, columnDefs) => {
        try {
          let value = 0.00;
          let inRowData = false;
          let index = -1;

          for (let i = 0; i < rowData.length; i++) {
            if (rowData[i][COSMETIC_ID] === parseInt(String(id))) {
              inRowData = true;
              index = i;
              break;
            }
          }

          // if the id isn't in the rowData we're gonna query for it.
          if (inRowData) {
            if (index !== -1) {
              if (rowData[index][col] !== null && rowData[index][col] !== undefined && col !== COSMETIC_ID && col !== ID) {
                const isExpression = /^=/.test(rowData[index][col]);

                if (isExpression) {
                  let result = await resolveExpressionStatements(req, COLUMN_TABLE, numberOfTables, rowData[index][col], rowData, columnDefs, recursionCounter += 1);
                  if (result === 'ERROR') throw 'There was an error in resolving an expression';

                  result = result.replace(/,/, '');

                  let invert = false;
                  if (/(\(|\))/.test(result)) {
                    result = result.replace(/(\(|\))/g, '');
                    invert = true;
                  }

                  if (/\%/.test(result)) {
                    result = result.replace(/\%/g, '');
                    result /= 100;
                    console.log(`did the thing set result to 1: ${result}`);
                  }

                  if (invert) {
                    result = -Math.abs(result);
                  }

                  value = parseFloat(result);

                  return value;
                } else {
                  if (rowData[index][col] === '') {
                    value = 0.00;
                  } else if (rowData[index][col] === 'ERROR') {
                    throw 'Cell this expression references is an errored cell.';
                  } else {
                    const hasDigit = /\d/.test(rowData[index][col]);
                    const hasLetter = /[a-zA-Z]/.test(rowData[index][col]);

                    if (hasDigit && !hasLetter) {
                      let preValue = rowData[index][col];
                      preValue = preValue.replace(/,/, '');

                      let invert = false;
                      if (/(\(|\))/.test(preValue)) {
                        preValue = preValue.replace(/(\(|\))/g, '');
                        invert = true;
                      }

                      if (/\%/.test(preValue)) {
                        preValue = preValue.replace(/\%/g, '');
                        preValue /= 100;
                      }

                      if (invert) {
                        preValue = -Math.abs(preValue);
                      }

                      value = parseFloat(preValue);
                    } else {
                      value = 0;
                    }
                  }

                  return value;
                }
              } else {
                if (rowData[index][col] === null) {
                  value = 0.00;
                } else if (col === COSMETIC_ID || col === ID) {
                  value = rowData[index][col];
                } else {
                  throw `The cell this expression references is undefined (Doesn't exist)`;
                }

                return value;
              }
            } else {
              throw `Couldn't find this id.`;
            }
          } else {
            let query = `SELECT table_name FROM ${COLUMN_TABLE} WHERE column_name = '${col}';`;
            let result = await db.query(query);
            if (result.length < 1) throw `There isn't a column with that name`;

            const tableName = result[0].table_name;

            query = `SELECT ${col} FROM ${tableName} WHERE ${COSMETIC_ID} = ${parseInt(String(id))};`;
            result = await db.query(query);
            if (result.length < 1) throw `No return from getting value for ${col} and ${id} from ${tableName} in getValueOfColIdPair`;

            const rawValue = result[0][col];
            if (rawValue !== null && rawValue !== undefined) {
              if (/^=/.test(rawValue)) {
                result = await resolveExpressionStatements(req, COLUMN_TABLE, numberOfTables, rawValue, rowData, columnDefs, recursionCounter += 1);
                if (result === 'ERROR') throw 'There was an error in resolving an expression';

                result = result.replace(/,/, '');

                let invert = false;
                if (/(\(|\))/.test(result)) {
                  result = result.replace(/(\(|\))/g, '');
                  invert = true;
                }

                if (/\%/.test(result)) {
                  result = result.replace(/\%/g, '');
                  result /= 100;
                }

                if (invert) {
                  result = -Math.abs(result);
                }

                value = parseFloat(result);

                return value;
              } else {
                if (rawValue === '') {
                  value = 0.00;
                } else if (rawValue === 'ERROR') {
                  throw 'The cell this expression references is an errored cell.';
                } else {
                  const hasDigit = /\d/.test(rawValue);

                  if (hasDigit) {
                    let preValue = rawValue;
                    preValue = preValue.replace(/,/, '');

                    let invert = false;
                    if (/(\(|\))/.test(preValue)) {
                      preValue = preValue.replace(/(\(|\))/g, '');
                      invert = true;
                    }

                    if (/\%/.test(preValue)) {
                      preValue = preValue.replace(/\%/g, '');
                      preValue /= 100;
                    }

                    if (invert) {
                      preValue = -Math.abs(preValue);
                    }

                    value = parseFloat(preValue);
                  } else {
                    value = 0;
                  }
                }

                return value;
              }
            } else {
              if (rawValue === null) {
                value = 0;
              } else {
                throw `Cell this expression references is undefined (Doesn't exist)`;
              }

              return value;
            }
          }
        } catch (err) {
          return util.errorHandler({err: err, context: 'getValueOfColIdPair'});
        }
      };

      const sumAllRanges = async (req, COLUMN_TABLE, expression, pos, rowData, columnDefs) => {
        try {
          const thisRange = expression.slice(0, pos);
          const restOfExpression = expression.slice(pos + 1, expression.length);
          let newValue = 0;

          const posOfRangeSplitForRange = thisRange.search(/:/);
          const hasRangeSplitForRange = posOfRangeSplitForRange !== -1;

          if (!hasRangeSplitForRange) throw `Must be ':' in sumAllRanges exp range`;

          newValue = await sumRange(req, COLUMN_TABLE, numberOfTables, thisRange, posOfRangeSplitForRange, rowData, columnDefs);

          const posOfAdditionalRangeSplit = restOfExpression.search(/,/);
          const hasAdditionalRangeSplit = posOfAdditionalRangeSplit !== -1;

          if (hasAdditionalRangeSplit) {
            const result = await sumAllRanges(req, COLUMN_TABLE, restOfExpression, posOfAdditionalRangeSplit, rowData, columnDefs);
            newValue = parseFloat((newValue + result).toPrecision(12));

            return newValue;
          } else {
            const posOfRangeSplitForRest = restOfExpression.search(/:/);
            const hasRangeSplitForRest = posOfRangeSplitForRest !== -1;
            if (!hasRangeSplitForRest) throw `Must be ':' in sumAllRanges exp rest`;

            const result = await sumRange(req, COLUMN_TABLE, numberOfTables, restOfExpression, posOfRangeSplitForRest, rowData, columnDefs);
            newValue = parseFloat((newValue + result).toPrecision(12));

            return newValue;
          }
        } catch (err) {
          return util.errorHandler({err: err, context: 'sumAllRanges'});
        }
      };

      const sumRange = async (req, COLUMN_TABLE, numberOfTables, newValue, pos, rowData, columnDefs) => {
        const getArrayOfValues = async (req, COLUMN_TABLE, numberOfTables, rowMin, rowMax, columns, rowData, columnDefs) => {
          const arrayOfExpressionsIterator = async (req, COLUMN_TABLE, arrayOfExpressions, rowData, columnDefs) => {
            try {
              const arrayOfExpressionValues = [];

              for (let i = 0; i < arrayOfExpressions.length; i++) {
                const value = await getValueOfColIdPair(req, COLUMN_TABLE, arrayOfExpressions[i].key, arrayOfExpressions[i][COSMETIC_ID], rowData, columnDefs);
                arrayOfExpressionValues.push(value);
              }

              return arrayOfExpressionValues;
            } catch (err) {
              return util.errorHandler({err: err, context: 'arrayOfExpressionsIterator'});
            }
          };

          const getMinAndMaxRowIndexes = (rowData) => {
            let minIndex = -1;
            let maxIndex = -1;

            for (let i = 0; i < rowData.length; i++) {
              if (rowData[i][COSMETIC_ID] === rowMin) {
                minIndex = i;
              }

              if (rowData[i][COSMETIC_ID] === rowMax) {
                maxIndex = i;
              }

              if (minIndex !== -1 && maxIndex !== -1) {
                break;
              }
            }

            return [minIndex, maxIndex];
          };

          const getRelevantRows = async (req, COLUMN_TABLE, numberOfTables, rowData, columns, minIndex, maxIndex) => {
            let result = [];

            if (minIndex !== -1 && maxIndex !== -1) {
              for (let i = minIndex; i <= maxIndex; i++) {
                result.push(rowData[i]);
              }
            } else {
              let VALUES_QUERY = `SELECT ${COSMETIC_ID}, ${ID}, `;

              for (let i = 0; i < columns.length; i++) {
                VALUES_QUERY += columns[i];

                if (i !== columns.length - 1) {
                  VALUES_QUERY += ',';
                }
              }

              const DATA_TABLE = COLUMN_TABLE.substring(0, COLUMN_TABLE.length - 8);

              VALUES_QUERY += ' FROM ' + DATA_TABLE;

              for (let i = 1; i < numberOfTables; i++) {
                VALUES_QUERY += ` INNER JOIN ${DATA_TABLE}_${(i + 1)} using (${COSMETIC_ID}, ${ID})`;
              }

              VALUES_QUERY += `
                WHERE ${COSMETIC_ID} <= ${rowMax}
                AND ${COSMETIC_ID} >= ${rowMin}
                ORDER BY ${COSMETIC_ID};
              `;

              result = await db.query(VALUES_QUERY);
            }

            return result;
          };

          try {
            const [minIndex, maxIndex] = getMinAndMaxRowIndexes(rowData);
            let result = await getRelevantRows(req, COLUMN_TABLE, numberOfTables, rowData, columns, minIndex, maxIndex);

            let arrayOfValues = [];
            const arrayOfExpressions = [];

            for (let i = 0; i < result.length; i++) {
              for (let j = 0, keys = Object.keys(result[i]); j < keys.length; j++) {
                const key = keys[j];

                if (key !== COSMETIC_ID && key !== ID) {
                  let keyInColumns = false;
                  for (let i = 0; i < columns.length; i++) {
                    if (key === columns[i]) {
                      keyInColumns = true;
                      break;
                    }
                  }

                  if (keyInColumns) {
                    if (result[i][key] !== null && result[i][key].length > 0) {
                      if (!/^=/.test(result[i][key])) {
                        if (/^[-\d.,]+$/.test(result[i][key])) {
                          let value = result[i][key].replace(/,/g, '');

                          let invert = false;
                          if (/(\(|\))/.test(value)) {
                            value = value.replace(/(\(|\))/g, '');
                            invert = true;
                          }

                          if (/\%/.test(value)) {
                            value = value.replace(/\%/g, '');
                            value /= 100;
                          }

                          if (invert) {
                            value = -Math.abs(value);
                          }

                          if (/-/.test(value)) {
                            if (/\d/.test(value)) {
                              if (!/\d-/.test(value)) {
                                arrayOfValues.push(parseFloat(value));
                              } else {
                                // case where - is somewhere other than the front.
                                arrayOfValues.push(0);
                              }
                            } else {
                              // case where it's just '-'
                              arrayOfValues.push(0);
                            }
                          } else {
                            // value with no negative
                            arrayOfValues.push(parseFloat(value));
                          }
                        } else {
                          // has a character other than those I allow
                          arrayOfValues.push(0);
                        }
                      } else {
                        arrayOfExpressions.push({
                          key: key,
                          [COSMETIC_ID]: result[i][COSMETIC_ID]
                        });
                      }
                    } else {
                      arrayOfValues.push(0);
                    }
                  }
                }
              }
            }

            if (arrayOfExpressions.length !== 0) {
              result = await arrayOfExpressionsIterator(req, COLUMN_TABLE, arrayOfExpressions, rowData, columnDefs);
              arrayOfValues = arrayOfValues.concat(result);
              return arrayOfValues;
            } else {
              return arrayOfValues;
            }
          } catch (err) {
            return util.errorHandler({err: err, context: 'getArrayOfValues'});
          }
        };

        try {
          const leftOfExp = getColIdPair(newValue.slice(0, pos));
          const rightOfExp = getColIdPair(newValue.slice(pos + 1, newValue.length));

          const rowMax = Math.max(parseInt(leftOfExp.id), parseInt(rightOfExp.id));
          const rowMin = Math.min(parseInt(leftOfExp.id), parseInt(rightOfExp.id));

          const columns = await getColumnRange(columnDefs, leftOfExp.col, rightOfExp.col);
          const arrayOfValues = await getArrayOfValues(req, COLUMN_TABLE, numberOfTables, rowMin, rowMax, columns, rowData, columnDefs);

          let isAllNumbers = false;

          for (let i = 0; i < arrayOfValues.length; i++) {
            if (!isNaN(arrayOfValues[i])) {
              isAllNumbers = true;
            } else {
              isAllNumbers = false;
              break;
            }
          }

          if (isAllNumbers) {
            newValue = 0.00;

            for (let i = 0; i < arrayOfValues.length; i++) {
              newValue = parseFloat((newValue + parseFloat(arrayOfValues[i])).toPrecision(12));
            }
          } else {
            throw 'Array of values is not all numbers';
          }

          return newValue;
        } catch (err) {
          return util.errorHandler({err: err, context: 'sumRange'});
        }
      };

      const resolveOrderOfOperations = async (req, COLUMN_TABLE, expression, rowData, columnDefs) => {
        try {
          let pos = expression.search(/[+\-]{1}/);
          let result;

          if (pos !== -1) {
            let left = expression.substring(0, pos);
            const op = expression[pos];
            let right = expression.substring(pos + 1);

            left = await resolveOrderOfOperations(req, COLUMN_TABLE, left, rowData, columnDefs);
            right = await resolveOrderOfOperations(req, COLUMN_TABLE, right, rowData, columnDefs);

            if (op === '+') {
              result = parseFloat((left + right).toPrecision(12));
            } else if (op === '-') {
              result = parseFloat((left - right).toPrecision(12));
            }
          } else {
            pos = -1;
            pos = expression.search(/[*/]{1}/);

            if (pos !== -1) {
              let left = expression.substring(0, pos);
              const op = expression[pos];
              let right = expression.substring(pos + 1);

              left = await resolveOrderOfOperations(req, COLUMN_TABLE, left, rowData, columnDefs);
              right = await resolveOrderOfOperations(req, COLUMN_TABLE, right, rowData, columnDefs);

              if (op === '*') {
                result = parseFloat((left * right).toPrecision(12));
              } else if (op === '/') {
                result = right !== 0 ? parseFloat((left / right).toPrecision(12)) : 0;
              }
            } else {
              let colIdPair;

              const isDecimalNumber = /[\d]+\.[\d]+/.test(expression);
              if (!isDecimalNumber) {
                colIdPair = getColIdPair(expression);
              }

              if (colIdPair && colIdPair.col) {
                result = await getValueOfColIdPair(req, COLUMN_TABLE, colIdPair.col, colIdPair.id, rowData, columnDefs);
              } else {
                result = parseFloat(expression);
              }
            }
          }

          return result;
        } catch (err) {
          return util.errorHandler({err: err, context: 'resolveOrderOfOperations'});
        }
      };

      try {
        if (recursionCounter >= 500) throw 'Cell input is causing infinite recursion. Setting value to ERROR';

        const inCache = cache.findExprInCache(req, expression);
        if (inCache) return inCache;

        const originalExpression = expression;

        let newValue;

        if (expression === undefined || expression === null || typeof expression !== 'string') throw `Expression isn't in right format. Likely getting an irregular value for expression.`;

        const isExpression = expression.search(/^=/) === 0;
        if (isExpression) {
          // remove =
          expression = expression.slice(1, expression.length);

          const isSum = /SUM\([\w:,/\-.+*]+\)/.test(expression);
          if (isSum) {
            // remove SUM and cooresponding parenthesis
            expression = expression.slice(4, expression.length - 1);

            const posOfSumSplit = expression.search(/,/);
            const isMultipleSumRanges = posOfSumSplit !== -1;

            if (isMultipleSumRanges) {
              newValue = await sumAllRanges(req, COLUMN_TABLE, expression, posOfSumSplit, rowData, columnDefs);
              cache.addToCache(req, originalExpression, String(newValue));
              return String(newValue);
            } else {
              const posOfRangeSplit = expression.search(/:/);
              const hasRangeSplit = posOfRangeSplit !== -1;
              if (hasRangeSplit) {
                newValue = await sumRange(req, COLUMN_TABLE, numberOfTables, expression, posOfRangeSplit, rowData, columnDefs);
                cache.addToCache(req, originalExpression, String(newValue));
                return String(newValue);
              } else {
                newValue = await resolveOrderOfOperations(req, COLUMN_TABLE, expression, rowData, columnDefs);
                cache.addToCache(req, originalExpression, String(newValue));
                return String(newValue);
              }
            }
          } else {
            newValue = await resolveOrderOfOperations(req, COLUMN_TABLE, expression, rowData, columnDefs);
            cache.addToCache(req, originalExpression, String(newValue));
            return String(newValue);
          }
        } else {
          newValue = expression;
          return String(newValue);
        }
      } catch (err) {
        util.errorHandler({err: err, context: 'resolveExpressionStatements', isLast: true});
        return 'ERROR';
      }
    };

    try {
      const DATA_TABLE = COLUMN_TABLE.substring(0, COLUMN_TABLE.length - 8);
      const numberOfTables = await gridGeneral.findNumberOfTables(db, DATA_TABLE);
      const rowData = JSON.parse(JSON.stringify(rData));
      const newRowData = JSON.parse(JSON.stringify(rData));

      const expressionsToResolve = [];

      // create base for json object and start resolving expressions
      for (let i = 0; i < rowData.length; i++) {
        for (let j = 0, keys = Object.keys(rowData[i]); j < keys.length; j++) {
          const key = keys[j];

          const pos = String(rowData[i][key]).search(/^=/);
          if (pos === 0) {
            expressionsToResolve.push({
              row: i,
              key: key,
              exp: rowData[i][key],
              result: ''
            });
          }
        }
      }

      if (expressionsToResolve.length === 0) return rowData;

      const query = `SELECT * FROM ${COLUMN_TABLE} ORDER BY id;`;
      const columnDefs = await db.query(query);

      for (let i = 0; i < expressionsToResolve.length; i++) {
        expressionsToResolve[i].result = await resolveExpressionStatements(req, COLUMN_TABLE, numberOfTables, expressionsToResolve[i].exp, rowData, columnDefs);
      }

      // adds exp_value_key_row: result to the rowData so the front-end
      // can replace the expressions with their calculated values.
      for (const x of expressionsToResolve) {
        const row = rowData[x.row][COSMETIC_ID];
        newRowData[0][`expvalue_${x.key}_${row}`] = String(x.result);
      }

      return newRowData;
    } catch (err) {
      return util.errorHandler({err: err, context: 'resolveAllExpressionStatements'});
    }
  };

  const changeQueryForGrouping = async (request, SELECT_QUERY, LAST_ROW_QUERY) => {
    const handleGroupings = (rowGroupFilterClause) => {
      const handleAggData = () => {
        let distinctReplacementString = '\n';

        for (let i = 0; i <= request.groupKeys.length; i++) {
          distinctReplacementString += `\t\t\t${request.rowGroupCols[i].field}`;

          if (i <= request.groupKeys.length) {
            distinctReplacementString += ',\n';
          }
        }

        for (let i = 0; i < request.valueCols.length; i++) {
          if (request.valueCols[i].type === 'boolean') {
            distinctReplacementString += `\t\t\tCASE
              WHEN ${request.valueCols[i].func}(${request.valueCols[i].field}) = true THEN 'true'
              ELSE 'false'
            END as ${request.valueCols[i].field}`;
          } else {
            distinctReplacementString += `\t\t\t${request.valueCols[i].func}(${request.valueCols[i].field}) as ${request.valueCols[i].field}`;
          }

          if (i < request.valueCols.length - 1) {
            distinctReplacementString += ',\n';
          }
        }

        distinctReplacementString += `\n\t\tFROM (\n\t\t\tSELECT\n`;

        selectReplacementString = selectReplacementString.replace(/DISTINCT/, distinctReplacementString);
        selectReplacementString += ',';

        for (let i = 0; i < request.valueCols.length; i++) {
          if (request.valueCols[i].type === 'decimal') {
            selectReplacementString += `\n\t\t\t\tCASE
                WHEN ${request.valueCols[i].field} ~ '^-?\\d*\\.?\\d*$$' AND ${request.valueCols[i].field} != '' THEN CAST(REPLACE(${request.valueCols[i].field}, ',', '') AS decimal)
                ELSE 0
              END as ${request.valueCols[i].field},`;
          } else if (request.valueCols[i].type === 'boolean') {
            selectReplacementString += `\n\t\t\t\tCASE
                  WHEN ${request.valueCols[i].field} = 'true' THEN true
                  ELSE false
                END as ${request.valueCols[i].field},`;
          }
        }

        selectReplacementString = selectReplacementString.slice(0, -1);

        let preOrderByString = ') as groupSelect\nGROUP BY ';

        for (let i = 0; i <= request.groupKeys.length; i++) {
          preOrderByString += `${request.rowGroupCols[i].field}`;

          if (i < request.groupKeys.length) {
            preOrderByString += ',\n';
          }
        }

        orderByReplacementString = orderByReplacementString.replace(/\(t1\)\./g, '');

        orderByReplacementString = preOrderByString + '\n' + orderByReplacementString;

        return [selectReplacementString, orderByReplacementString];
      };

      let selectReplacementString = 'SELECT\n\t\tDISTINCT ';
      let orderByReplacementString = 'ORDER BY ';
      let lastRowSelectReplacementString = 'SELECT \n\t\tFROM (\n\t\t\tSELECT DISTINCT ';
      let whereReplacementString;
      let lastRowWhereReplacementString;

      if (/WHERE[\s]*\(/.test(SELECT_QUERY)) {
        if (rowGroupFilterClause) {
          whereReplacementString = `WHERE ${rowGroupFilterClause} AND `;
          lastRowWhereReplacementString = `\t\tAND ${rowGroupFilterClause} AND `;
        } else {
          whereReplacementString = 'WHERE ';
          lastRowWhereReplacementString = '\t\tAND ';
        }
      } else {
        if (rowGroupFilterClause) {
          whereReplacementString = `WHERE ${rowGroupFilterClause} AND `;
          lastRowWhereReplacementString = `\t\tWHERE ${rowGroupFilterClause} AND `;
        } else {
          whereReplacementString = 'WHERE ';
          lastRowWhereReplacementString = '\t\tWHERE ';
        }
      }

      for (let i = 0; i <= request.groupKeys.length; i++) {
        selectReplacementString += `\t\t\t\t${request.rowGroupCols[i].field}`;

        if (request.rowGroupCols[i].field === 'month') {
          orderByReplacementString += `to_date(${request.rowGroupCols[i].field}, 'Month')`;
        } else {
          orderByReplacementString += `${request.rowGroupCols[i].field}`;
        }

        lastRowSelectReplacementString += `${request.rowGroupCols[i].field}`;

        if (i !== request.groupKeys.length) {
          selectReplacementString += ',\n';
          orderByReplacementString += ', ';
          lastRowSelectReplacementString += ', ';
        }
      }

      if (request.groupKeys.length > 0) {
        for (let i = 0; i < request.groupKeys.length; i++) {
          whereReplacementString += `${request.rowGroupCols[i].field} = '${request.groupKeys[i]}'`;
          lastRowWhereReplacementString += `${request.rowGroupCols[i].field} = '${request.groupKeys[i]}'`;

          if (i < request.groupKeys.length - 1) {
            whereReplacementString += ' AND ';
            lastRowWhereReplacementString += ' AND ';
          }
        }
      }

      if (whereReplacementString === 'WHERE ') whereReplacementString = '';
      if (/AND $/.test(whereReplacementString)) whereReplacementString = whereReplacementString.slice(0, -4);
      if (lastRowWhereReplacementString === '\t\tWHERE ') lastRowWhereReplacementString = '';
      if (/AND $/.test(lastRowWhereReplacementString)) lastRowWhereReplacementString = lastRowWhereReplacementString.slice(0, -4);

      [selectReplacementString, orderByReplacementString] = handleAggData();

      selectReplacementString += '\n\t\tFROM (';

      SELECT_QUERY = SELECT_QUERY.replace(/SELECT \*[\s]*FROM \(/, selectReplacementString);

      const re = new RegExp('WHERE temp.row_number > [\\d]* AND temp.row_number <= [\\d]*');
      SELECT_QUERY = SELECT_QUERY.replace(re, whereReplacementString + '\n' + orderByReplacementString);

      LAST_ROW_QUERY = LAST_ROW_QUERY.replace(/SELECT/, lastRowSelectReplacementString);
      LAST_ROW_QUERY += `${lastRowWhereReplacementString}\n) as t1;`;

      return [SELECT_QUERY, LAST_ROW_QUERY];
    };

    const handleGettingData = (rowGroupFilterClause) => {
      const orderByRegex = new RegExp('(ORDER BY[\\w\\W]*)\\) as inner_temp');
      const orderByClause = SELECT_QUERY.match(orderByRegex)[1];

      const dataIsFiltered = SELECT_QUERY.search(new RegExp('WHERE[\\s]*\\(')) !== -1;

      if (!dataIsFiltered) {
        let whereReplacementString = 'WHERE ';

        for (let i = 0; i < request.groupKeys.length; i++) {
          whereReplacementString += `${request.rowGroupCols[i].field} ILIKE '${request.groupKeys[i].replace(/\'/, '\'\'')}'`;

          if (i < request.groupKeys.length - 1) {
            whereReplacementString += ' AND ';
          }
        }

        if (rowGroupFilterClause && whereReplacementString !== 'WHERE ') {
          whereReplacementString += ` AND ${rowGroupFilterClause}`;
        }

        const finalReplacementString = `${whereReplacementString}\n${orderByClause}) as inner_temp`;

        SELECT_QUERY = SELECT_QUERY.replace(orderByRegex, () => {
          return finalReplacementString;
        });
        LAST_ROW_QUERY += `\n${whereReplacementString};`;
      } else {
        let whereReplacementString = 'AND ';

        for (let i = 0; i < request.groupKeys.length; i++) {
          whereReplacementString += `${request.rowGroupCols[i].field} ILIKE '${request.groupKeys[i]}'`;

          if (i < request.groupKeys.length - 1) {
            whereReplacementString += ' AND ';
          }
        }

        if (rowGroupFilterClause && whereReplacementString !== 'AND ') {
          whereReplacementString += ` AND ${rowGroupFilterClause}`;
        }

        const finalReplacementString = `${whereReplacementString}\n${orderByClause}) as inner_temp`;

        SELECT_QUERY = SELECT_QUERY.replace(orderByRegex, () => {
          return finalReplacementString;
        });
        LAST_ROW_QUERY += `\n${whereReplacementString};`;
      }

      return [SELECT_QUERY, LAST_ROW_QUERY];
    };

    try {
      let rowGroupFilterClause = '';

      const numOfGroupCols = request.rowGroupCols.length;
      const groupsBeingUsed = numOfGroupCols !== 0;
      const gettingData = request.groupKeys.length === numOfGroupCols;

      if (groupsBeingUsed && !gettingData) {
        [SELECT_QUERY, LAST_ROW_QUERY] = handleGroupings(rowGroupFilterClause);
      } else if (groupsBeingUsed && gettingData) {
        [SELECT_QUERY, LAST_ROW_QUERY] = handleGettingData(rowGroupFilterClause);
      }

      return [SELECT_QUERY, LAST_ROW_QUERY];
    } catch (err) {
      return util.errorHandler({err: err, context: 'changeQueryForGrouping'});
    }
  };

  try {
    debug.log('starting getRows');

    req.body.func = 'getRows';
    req.body.db = setDatabase(req.body.db);

    // await db.setReq(req);

    const request = req.body.data[0].request;
    const filterPattern = req.body.data[0].filterPattern;
    const filter = req.body.data[0].filter;
    const DATA_TABLE = req.body.data[0].gridName;
    const COLUMN_TABLE = gridGeneral.getCorrectColumnTable(req.body.data[0]);

    /*
      when the grid is refreshed it always gets rows 0-200 first,
      so I'm clearing the expression resolve cache on refresh by
      checking for that case.
    */
    if (request.startRow === 0) {
      cache.clearCache(req);
    }

    console.log('req.body.data');
    console.log(req.body.data);

    console.log('request');
    console.log(request);

    const tableAggObj = {
      tableName: DATA_TABLE,
      columnTableName: COLUMN_TABLE,
      startRow: request.startRow ? request.startRow : 0,
      endRow: request.endRow ? request.endRow : 100000000,
      sortModel: request.sortModel,
      filter: filter,
      filterPattern: filterPattern,
      suppressTableSplit: request.suppressTableSplit
    };

    console.log(tableAggObj);

    let [SELECT_QUERY, LAST_ROW_QUERY] = await tableAggregator(tableAggObj);
    if (!SELECT_QUERY || !LAST_ROW_QUERY) throw 'No result from tableAggregator';

    const groupsBeingUsed = request.rowGroupCols.length !== 0;
    if (groupsBeingUsed) {
      [SELECT_QUERY, LAST_ROW_QUERY] = await changeQueryForGrouping(request, SELECT_QUERY, LAST_ROW_QUERY);
    }

    console.log(SELECT_QUERY);
    let rowData = await db.query(SELECT_QUERY);

    console.log(LAST_ROW_QUERY);
    const results = await db.query(LAST_ROW_QUERY);
    if (rowData.length < 1 || results.length < 1) {
      console.log('No data in data table.');
      return res.status(200).json(security.encrypt({success: true, result: {message: 'Found no rows.', rows: [], lastRow: 1}}));
    }

    rowData = await resolveAllExpressionStatements(req, COLUMN_TABLE, rowData);

    debug.log('finished getRows');

    if (groupsBeingUsed) {
      for (let i = 0; i < rowData.length; i++) {
        rowData[i].agGridTextNodeId = `${rowData[i].firm ? rowData[i].firm : ''}${rowData[i].year ? '-' + rowData[i].year : ''}${rowData[i].month ? '-' + rowData[i].month : ''}`;
      }
    }

    const response = {
      success: true,
      rows: rowData,
      lastRow: results.length
    };

    return res.status(200).json(security.encrypt({success: true, result: response}));
  } catch (err) {
    return res.status(200).json(security.encrypt({success: false, result: {msg: DEFAULT_ERROR_MESSAGE + ' Error Code: 1', critical: true, result: util.errorHandler({err: err, context: 'getRows', isLast: true})}}));
  }
}

async function getRawRows(req, res) {
  try {
    req.body.func = 'getRawRows';
    req.body.db = setDatabase(req.body.db);

    // await db.setReq(req);

    const DATA_TABLE = req.body.data[0].gridName;
    const defaultSort = req.body.data[0].defaultSort;
    const defaultSpecificValueSortOrder = req.body.data[0].defaultSpecificValueSortOrder;
    const filter = req.body.data[0].filter;

    const numOfTables = await gridGeneral.findNumberOfTables(db, DATA_TABLE);

    let query = `SELECT *\nFROM ${DATA_TABLE} `;

    if (!defaultSort && defaultSpecificValueSortOrder) {
      query = `
        SELECT  *,
                CASE
      `;

      for (let i = 0; i < defaultSpecificValueSortOrder.order.length; i++) {
        query += `
                  WHEN ${defaultSpecificValueSortOrder.colId} ILIKE '${defaultSpecificValueSortOrder.order[i]}' THEN ${i + 1}
        `;
      }

      query += `
                  ELSE 99
                  END as order_${defaultSpecificValueSortOrder.colId}
        FROM ${DATA_TABLE} 
      `;
    }

    for (let i = 1; i < numOfTables; i++) {
      query += `\nINNER JOIN\n${DATA_TABLE}_${i + 1} USING (${COSMETIC_ID}, ${ID})\n`;
    }

    if (filter) {
      query += 'WHERE ';

      if (filter.length !== undefined) {
        for (let i = 0; i < filter.length; i++) {
          query += filter[i].clause + ' ';

          if (i !== filter.length - 1) {
            query += 'AND ';
          }
        }
      } else {
        query += `(${filter.clause}) `;
      }
    }

    if (defaultSort) {
      query += `ORDER BY ${defaultSort}`;
    } else if (defaultSpecificValueSortOrder) {
      query += `ORDER BY order_${defaultSpecificValueSortOrder.colId}`;
    } else {
      query += `ORDER BY ${COSMETIC_ID};`;
    }

    const response = await db.query(query);

    return res.status(200).json(security.encrypt({success: true, result: response}));
  } catch (err) {
    return res.status(200).json(security.encrypt({success: false, result: {msg: DEFAULT_ERROR_MESSAGE + ' Error Code: 2', critical: true, result: util.errorHandler({err: err, context: 'getRawRows', isLast: true})}}));
  }
}

async function verifyDataTable(req, res) {
  try {
    req.body.func = 'verifyDataTable';
    req.body.db = setDatabase(req.body.db);

    // await db.setReq(req);

    const DATA_TABLE = req.body.data[0].gridName;

    if (await checkTableExists(DATA_TABLE)) return res.status(200).json(security.encrypt({success: true, result: true}));
    debug.log(`No data table exists, let's create it.`);

    if (!await createDataTable(DATA_TABLE)) throw 'Error in createDataTable';
    debug.log(`Now let's check again to make sure`);

    if (!await checkTableExists(DATA_TABLE)) throw 'Data table was not found at final check';

    debug.log('SUCCESS');

    return res.status(200).json(security.encrypt({success: true, result: true}));
  } catch (err) {
    return res.status(200).json(security.encrypt({success: false, result: {msg: DEFAULT_ERROR_MESSAGE + ' Error Code: 3', critical: true, result: util.errorHandler({err: err, context: 'verifyDataTable', isLast: true})}}));
  }
}

async function verifyStyleTable(req, res) {
  try {
    req.body.func = 'verifyStyleTable';
    req.body.db = setDatabase(req.body.db);

    // await db.setReq(req);

    const DATA_TABLE = req.body.data[0].gridName;
    const STYLE_TABLE = DATA_TABLE + '_style';

    if (await checkTableExists(STYLE_TABLE)) return res.status(200).json(security.encrypt({success: true, result: true}));
    debug.log(`No style table exists, let's create it.`);

    if (!await createStyleTable(DATA_TABLE)) throw 'Error in createStyleTable';
    debug.log(`Now let's check again to make sure`);

    if (!await checkTableExists(STYLE_TABLE)) throw 'Style table was not found at final check';

    debug.log('SUCCESS');

    return res.status(200).json(security.encrypt({success: true, result: true}));
  } catch (err) {
    return res.status(200).json(security.encrypt({success: false, result: {msg: DEFAULT_ERROR_MESSAGE + ' Error Code: 4', critical: true, result: util.errorHandler({err: err, context: 'verifyStyleTable', isLast: true})}}));
  }
}

async function verifyColumnTable(req, res) {
  try {
    req.body.func = 'verifyColumnTable';
    req.body.db = setDatabase(req.body.db);

    // await db.setReq(req);

    const DATA_TABLE = req.body.data.gridName;
    const COLUMN_TABLE = gridGeneral.getCorrectColumnTable(req.body.data);

    if (await checkTableExists(COLUMN_TABLE)) return res.status(200).json(security.encrypt({success: true, result: true}));
    debug.log(`No column table exists, let's create it.`);

    if (!await createColumnTable(DATA_TABLE)) throw 'Error in createColumnTable';
    debug.log(`Now let's check again to make sure`);

    if (!await checkTableExists(COLUMN_TABLE)) throw 'Column table was not found at final check';

    debug.log('SUCCESS');

    return res.status(200).json(security.encrypt({success: true, result: true}));
  } catch (err) {
    return res.status(200).json(security.encrypt({success: false, result: {msg: DEFAULT_ERROR_MESSAGE + ' Error Code: 5', critical: true, result: util.errorHandler({err: err, context: 'verifyColumnTable', isLast: true})}}));
  }
}

async function getColumns(req, res) {
  try {
    req.body.func = 'getColumns';
    req.body.db = setDatabase(req.body.db);

    // await db.setReq(req);

    const COLUMN_TABLE = gridGeneral.getCorrectColumnTable(req.body.data);

    if (!await checkTableExists(COLUMN_TABLE)) throw 'No column table';

    const query = `SELECT * FROM ${COLUMN_TABLE} ORDER BY id;`;
    const response = await db.query(query);
    if (response.length < 1) throw 'No columns in column table';

    return res.status(200).json(security.encrypt({success: true, result: response}));
  } catch (err) {
    return res.status(200).json(security.encrypt({success: false, result: {msg: DEFAULT_ERROR_MESSAGE + ' Error Code: 6', critical: true, result: util.errorHandler({err: err, context: 'getColumns', isLast: true})}}));
  }
}

async function getDataTablesSchema(req, res) {
  try {
    req.body.func = 'getDataTablesSchema';
    req.body.db = setDatabase(req.body.db);

    // await db.setReq(req);

    const DATA_TABLE = req.body.data.gridName;

    const query = `
      SELECT
        column_name,
        data_type,
        character_maximum_length
      FROM
        information_schema.columns
      WHERE table_name SIMILAR TO '${DATA_TABLE}[_]?[\\d]*';
    `;

    const response = await db.query(query);

    return res.status(200).json(security.encrypt({success: true, result: response}));
  } catch (err) {
    return res.status(200).json(security.encrypt({success: false, result: {msg: DEFAULT_ERROR_MESSAGE + ' Error Code: 7', critical: true, result: util.errorHandler({err: err, context: 'getDataTablesSchema', isLast: true})}}));
  }
}

// saving functions
async function updateData(req, res) {
  const updateIterator = async (updateIteratorObj) => {
    try {
      const req = updateIteratorObj.req;
      let UPDATE_QUERY = updateIteratorObj.UPDATE_QUERY;
      const columnTableData = updateIteratorObj.columnTableData;
      const columnProperties = updateIteratorObj.columnProperties;
      const updates = updateIteratorObj.updates;
      const hasUpdateColumns = updateIteratorObj.hasUpdateColumns;
      const index = updateIteratorObj.index === undefined ? 0 : updateIteratorObj.index;
      let trunc = updateIteratorObj.trunc === undefined ? false : updateIteratorObj.trunc;
      let error = updateIteratorObj.error === undefined ? false : updateIteratorObj.error;

      const DATA_TABLE = req.body.data[0].gridName;
      const COLUMN_TABLE = gridGeneral.getCorrectColumnTable(req.body.data[0]);

      // Final loop finishing up.
      if (index >= updates.length) {
        let data = {
          message: false,
          result: UPDATE_QUERY
        };

        if (error) {
          data = {
            message: `Error: A cell you're attempting to edit has changed. Please refresh (F5) to change cells in this column. Error Code 10`,
            critical: true,
            result: false
          };
        } else if (trunc) {
          data = {
            message: 'Edit was truncated to fit database specifications. Please refresh (F5) to see true values. Error Code 11',
            critical: true,
            result: UPDATE_QUERY
          };
        }

        return data;
      }

      // Main loop
      const id = parseInt(updates[index][ID]);
      const colId = updates[index].colId;
      const value = updates[index].value;

      const column = columnTableData.find((column) => column.column_name === colId);
      if (column === undefined) {
        error = true;
        const data = {
          message: `Error: A column you're attempting to edit a cell in has changed. Please refresh (F5) to change cells in this column. Error Code: 9`,
          critical: true,
          result: false
        };
        return data;
      }

      const rowNum = column.id;
      const dataTable = column.table_name;

      const dateDataTypes = [
        'date',
        'time without time zone',
        'time with time zone',
        'timestamp without time zone',
        'timestamp with time zone'
      ];

      const numberDataTypes = [
        'integer',
        'bigint',
        'double precision',
        'real'
      ];

      const databaseValue = (await db.query(`SELECT ${colId} FROM ${dataTable} WHERE ${ID} = ${id};`))[0][colId];
      let oldValue = updates[index].oldValue;

      const columnProp = columnProperties.find((column) => column.column_name === colId);

      if (oldValue === '' &&
          (dateDataTypes.includes(columnProp.data_type) ||
          numberDataTypes.includes(columnProp.data_type) ||
          columnProp.data_type === 'boolean')) {
        oldValue = null;
      }

      if (databaseValue !== oldValue) {
        error = true;
        const data = {
          message: `Error: A cell you're attempting to edit has changed. Please refresh (F5) to change cells in this column. Error Code: 8`,
          critical: true,
          result: false
        };
        return data;
      }

      UPDATE_QUERY += `UPDATE ${dataTable} SET ${colId} = `;

      if (columnProp.data_type === 'character varying') {
        const maxLength = (columnProp === undefined || columnProp.character_maximum_length === null) ? MAX_CHARACTERS_PER_DATA : columnProp.character_maximum_length;
        trunc = maxLength && value.length > maxLength;

        const sanatizedValue = value.replace(`'`, `''`);
        UPDATE_QUERY += trunc ? `LEFT('${sanatizedValue}', ${maxLength})` : `'${sanatizedValue}'`;
      } else if (columnProp.data_type === 'text') {
        const sanatizedValue = value.replace(`'`, `''`);
        UPDATE_QUERY += `'${sanatizedValue}'`;
      } else if (dateDataTypes.includes(columnProp.data_type)) {
        const sanatizedValue = value === '' ? null : value;
        UPDATE_QUERY += sanatizedValue === null ? `${sanatizedValue}` : `'${sanatizedValue}'`;
      } else if (numberDataTypes.includes(columnProp.data_type)) {
        const sanatizedValue = value === '' ? null : value;
        UPDATE_QUERY += `${sanatizedValue}`;
      } else if (columnProp.data_type === 'boolean') {
        let convertedValue;
        if (value === '') {
          convertedValue = null;
        } else if (typeof value === 'boolean') {
          convertedValue = value;
        } else {
          convertedValue = /true/i.test(value) ? true : /false/i.test(value) ? false : null;
          if (convertedValue === null) {
            error = true;
            const data = {
              message: 'Non boolean value added into boolean column. Canceling operation.',
              critical: true,
              result: false
            };
            return data;
          }
        }

        UPDATE_QUERY += `${convertedValue}`;
      } else {
        error = true;
        const data = {
          message: `The data type of column to update is currently not supported (${columnProp.data_type}). Canceling operaton.`,
          critical: true,
          result: false
        };
        return data;
      }


      if (dataTable === DATA_TABLE && hasUpdateColumns && columnProp.column_name !== 'update_date') {
        if (hasUpdateColumns.updateDate) {
          UPDATE_QUERY += `, update_date = now()`;
        }

        if (hasUpdateColumns.updateCount && columnProp.column_name !== 'update_count') {
          UPDATE_QUERY += `, update_count = (CASE WHEN update_count IS NOT NULL THEN update_count + 1 WHEN update_count is NULL THEN 1 ELSE update_count END)`;
        }
      }

      UPDATE_QUERY += ` WHERE ${ID} = ${id};\n`;

      const newExpression = /^=/.test(value) && !/^=/.test(oldValue);
      const oldExpressionRemoved = !/^=/.test(value) && /^=/.test(oldValue);
      if (newExpression) {
        UPDATE_QUERY += `UPDATE ${COLUMN_TABLE} SET has_expression = true WHERE id = ${rowNum};\n`;
      } else if (oldExpressionRemoved) {
        const numberOfTables = await gridGeneral.findNumberOfTables(db, DATA_TABLE);

        let DATA_COLUMN_QUERY = `
          SELECT
            ${ID},
            ${colId}
          FROM
            ${DATA_TABLE}
          INNER JOIN
            ${DATA_TABLE}_style USING (${ID})
        `;

        for (let j = 2; j < numberOfTables; j++) {
          DATA_COLUMN_QUERY += `
            INNER JOIN
              ${DATA_TABLE}_${j} USING (${ID})
            INNER JOIN
              ${DATA_TABLE}_style_${j} USING (${ID})
          `;
        }

        DATA_COLUMN_QUERY += ` ORDER BY ${COSMETIC_ID};`;

        const dataColumn = await db.query(DATA_COLUMN_QUERY);

        const expFound = dataColumn.some((dataColumnRow) => dataColumnRow[ID] !== id && dataColumnRow[colId] !== null && /^=/.test(dataColumnRow[colId]));
        if (!expFound) {
          UPDATE_QUERY += `UPDATE ${COLUMN_TABLE} SET has_expression = false WHERE id = ${rowNum};\n`;
        }
      }

      updateIteratorObj.UPDATE_QUERY = UPDATE_QUERY;
      updateIteratorObj.trunc = trunc;
      updateIteratorObj.error = error;
      updateIteratorObj.index = updateIteratorObj.index === undefined ? 1 : updateIteratorObj.index + 1;
      const result = await updateIterator(updateIteratorObj);
      return result;
    } catch (err) {
      return util.errorHandler({err: err, context: 'updateIterator'});
    }
  };

  try {
    req.body.func = 'updateData';
    req.body.db = setDatabase(req.body.db);

    // await db.setReq(req);

    const updates = req.body.data;
    debug.log(updates);

    const DATA_TABLE = req.body.data[0].gridName;
    const COLUMN_TABLE = gridGeneral.getCorrectColumnTable(req.body.data[0]);

    let UPDATE_QUERY = 'BEGIN;\n';

    const numberOfTables = await gridGeneral.findNumberOfTables(db, DATA_TABLE);

    for (let i = 1; i <= numberOfTables; i++) {
      if (i === 1) {
        UPDATE_QUERY += `LOCK TABLE ${DATA_TABLE};\n`;
      } else {
        UPDATE_QUERY += `LOCK TABLE ${DATA_TABLE}_${i};\n`;
      }
    }

    let query = `
      SELECT
        column_name,
        data_type,
        character_maximum_length
      FROM
        information_schema.columns
      WHERE
        table_name SIMILAR TO '${DATA_TABLE}[_]?[\\d]*';
    `;

    const columnProperties = await db.query(query);

    query = `SELECT * FROM ${COLUMN_TABLE};`;
    const columnTableData = await db.query(query);

    const hasUpdateColumns = {updateDate: false, updateCount: false};

    for (let i = 0; i < columnTableData.length; i++) {
      if (columnTableData[i].column_name === 'update_date') {
        hasUpdateColumns.updateDate = true;
      }

      if (columnTableData[i].column_name === 'update_count') {
        hasUpdateColumns.updateCount = true;
      }
    }

    const updateIteratorObj = {
      req: req,
      UPDATE_QUERY: UPDATE_QUERY,
      columnTableData: columnTableData,
      columnProperties: columnProperties,
      updates: updates,
      hasUpdateColumns: hasUpdateColumns
    };

    const result = await updateIterator(updateIteratorObj);
    if (!result.result) {
      debug.log(result.message);
      return res.status(200).json(security.encrypt({success: true, result: {message: result.message, critical: result.critical}}));
    }

    UPDATE_QUERY = result.result;

    let changes = [];
    if (req.body.changeLog) {
      try {
        changes = gridGeneral.getChangesFromUpdates(updates);
        for (let i = 0; i < changes.length; i++) {
          changes[i]['old_state'] = await gridGeneral.getDataRecord(db, changes[i].gridName, changes[i][ID], numberOfTables);
          changes[i]['new_state'] = JSON.parse(JSON.stringify(changes[i]['old_state']));

          for (let j = 0; j < req.body.data.length; j++) {
            if (req.body.data[j][ID] === changes[i][ID]) {
              const colId = req.body.data[j].colId;
              changes[i]['new_state'][colId] = req.body.data[j].value;
            }
          }
        }
      } catch (err) {
        console.log(err);
        console.log('get Old/New state failed.');
      }
    }

    UPDATE_QUERY += 'COMMIT;';

    await db.query(UPDATE_QUERY);

    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      try {
        const insertChangeObj = {
          db: db,
          mainTable: `'${change.gridName}'`,
          func: `'${req.body.func}'`,
          columnAffected: change.colId !== null ? `'${change.colId}'` : change.colId,
          oldState: `'${gridGeneral.prepObjForSql(change.old_state)}'`,
          newState: `'${gridGeneral.prepObjForSql(change.new_state)}'`,
          username: `'${req.user.username}'`
        };
        await gridGeneral.insertChange(insertChangeObj);
      } catch (err) {
        console.log(err);
        console.log('insertChange failed.');
      }
    }

    debug.log('End of updateData');

    return res.status(200).json(security.encrypt({success: true, result: true}));
  } catch (err) {
    return res.status(200).json(security.encrypt({success: false, result: {msg: DEFAULT_ERROR_MESSAGE + ' Error Code: 12', critical: true, result: util.errorHandler({err: err, context: 'updateData', isLast: true})}}));
  }
}

async function updateStyle(req, res) {
  const updateIterator = async (updateIteratorObj) => {
    try {
      let UPDATE_QUERY = updateIteratorObj.UPDATE_QUERY;
      const columnTableData = updateIteratorObj.columnTableData;
      const updates = updateIteratorObj.updates;
      const index = updateIteratorObj.index === undefined ? 0 : updateIteratorObj.index;
      let error = updateIteratorObj.error === undefined ? false : updateIteratorObj.error;

      // Final loop finishing up.
      if (index >= updates.length) {
        let data = {
          message: 'Updated style(s).',
          result: UPDATE_QUERY
        };

        if (error) {
          data = {
            message: `Error: A cell you're attemping to edit the style of has changed. Please refresh (F5) to change cells in this column. Error Code: 31`,
            critical: true,
            result: false
          };
        }

        return data;
      }

      // Main loop
      const id = parseInt(updates[index][ID]);
      const colId = updates[index].colId;
      const value = security.sanitize(updates[index].value, MAX_CHARACTERS_PER_STYLE);

      const column = columnTableData.find((column) => column.column_name === colId.replace(/styleattrib_/, ''));
      if (column === undefined) {
        error = true;
        const data = {
          message: `Error: A column you're attempting to edit a cell in has changed. Please refresh (F5) to change cells in this column. Error Code: 30`,
          critical: true,
          result: false
        };
        return data;
      }

      const digitMatch = column.table_name.match(/_(\d+)/);
      const styleTable = digitMatch === null ? `${column.table_name}_style` : column.table_name.replace(/_\d+/, `_style_${digitMatch[1]}`);

      const databaseValue = (await db.query(`SELECT ${colId} FROM ${styleTable} WHERE ${ID} = ${id};`))[0][colId];
      if (databaseValue !== updates[index].oldValue) {
        error = true;
        const data = {
          message: `Error: A cell you're attempting to edit the style of has changed. Please refresh (F5) to change cells in this column. Error Code: 29`,
          critical: true,
          result: false
        };
        return data;
      }

      UPDATE_QUERY += `UPDATE ${styleTable} SET ${colId} = '${value}' WHERE ${ID} = ${id};`;

      updateIteratorObj.UPDATE_QUERY = UPDATE_QUERY;
      updateIteratorObj.error = error;
      updateIteratorObj.index = updateIteratorObj.index === undefined ? 1 : updateIteratorObj.index + 1;
      const result = await updateIterator(updateIteratorObj);
      return result;
    } catch (err) {
      return util.errorHandler({err: err, context:'updateIterator'});
    }
  };

  try {
    req.body.func = 'updateStyle';
    req.body.db = setDatabase(req.body.db);

    // await db.setReq(req);

    const updates = req.body.data;

    const DATA_TABLE = req.body.data[0].gridName;
    const STYLE_TABLE = DATA_TABLE + '_style';
    const COLUMN_TABLE = gridGeneral.getCorrectColumnTable(req.body.data[0]);

    let UPDATE_QUERY = 'BEGIN;\n';

    const numberOfTables = await gridGeneral.findNumberOfTables(db, DATA_TABLE);

    for (let i = 1; i <= numberOfTables; i++) {
      if (i === 1) {
        UPDATE_QUERY += `LOCK TABLE ${STYLE_TABLE};\n`;
      } else {
        UPDATE_QUERY += `LOCK TABLE ${STYLE_TABLE}_${i};\n`;
      }
    }

    const query = `SELECT * FROM ${COLUMN_TABLE};`;
    const columnTableData = await db.query(query);

    const updateIteratorObj = {
      UPDATE_QUERY: UPDATE_QUERY,
      columnTableData: columnTableData,
      updates: updates
    };

    const result = await updateIterator(updateIteratorObj);
    if (!result.result) {
      debug.log(result.message);
      return res.status(200).json(security.encrypt({success: true, result: {message: result.message, critical: result.critical}}));
    }

    UPDATE_QUERY = result.result;

    let changes = [];
    if (req.body.changeLog) {
      try {
        changes = gridGeneral.getChangesFromUpdates(updates);

        for (let i = 0; i < changes.length; i++) {
          changes[i]['old_state'] = await gridGeneral.getStyleRecord(db, changes[i].gridName, changes[i][ID], numberOfTables);
          changes[i]['new_state'] = JSON.parse(JSON.stringify(changes[i]['old_state']));

          for (let j = 0; j < req.body.data.length; j++) {
            if (req.body.data[j][ID] === changes[i][ID]) {
              const colId = req.body.data[j].colId;
              changes[i]['new_state'][colId] = req.body.data[j].value;
            }
          }
        }
      } catch (err) {
        console.log(err);
        console.log('get Old/New state failed.');
      }
    }

    UPDATE_QUERY += ' COMMIT;';

    await db.query(UPDATE_QUERY);

    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      try {
        const insertChangeObj = {
          db: db,
          mainTable: `'${change.gridName}'`,
          func: `'${req.body.func}'`,
          columnAffected: change.colId !== null ? `'${change.colId}'` : change.colId,
          oldState: `'${gridGeneral.prepObjForSql(change.old_state)}'`,
          newState: `'${gridGeneral.prepObjForSql(change.new_state)}'`,
          username: `'${req.user.username}'`
        };
        await gridGeneral.insertChange(insertChangeObj);
      } catch (err) {
        console.log(err);
        console.log('insertChange failed.');
      }
    }

    debug.log('End of updateStyle');

    return res.status(200).json(security.encrypt({success: true, result: true}));
  } catch (err) {
    return res.status(200).json(security.encrypt({success: false, result: {msg: DEFAULT_ERROR_MESSAGE + ' Error Code: 13', critical: true, result: util.errorHandler({err: err, context: 'updateStyle', isLast: true})}}));
  }
}

/*
  If formulas aren't incrementing it's likely because has_expression in the
  column table isn't set to true for that column even though there are
  expressions in it. Check that before modifying code.
*/

// addRow/removeRow helper function
const getIncrementExpressionQuery = async (req, id, type='inc') => {
  const forEachColumnThatHasExpression = async (req, columnTableData, numOfTables, index=0, builtString = '') => {
    const incrementData = (str, type='inc') => {
      const strParts = [];
      let pos = -1;

      do {
        pos = str.search(/[\d]+/);

        if (pos === -1) {
          strParts.push(str);
          str = '';
        } else if (pos === 0) {
          pos = str.search(/[\D]+/);

          if (pos === -1) {
            strParts.push(str);
            str = '';
          } else {
            strParts.push(str.substring(0, pos));
            str = str.substring(pos);
          }
        } else {
          strParts.push(str.substring(0, pos));
          str = str.substring(pos);
        }
      } while (str !== '');

      let newString = '';

      for (let i = 0; i < strParts.length; i++) {
        if (/\d/.test(strParts[i]) && /[a-z]+/.test(strParts[i - 1])) {
          newString += type === 'inc' ? String(parseInt(strParts[i]) + 1) : String(parseInt(strParts[i]) -1);
        } else {
          newString += strParts[i];
        }
      }

      return newString;
    };

    try {
      const DATA_TABLE = req.body.data.gridName;
      const column = columnTableData[index];

      if (column.has_expression) {
        let DATA_COLUMN_QUERY = `
          SELECT
            ${COSMETIC_ID},
            ${ID},
            ${column.column_name}
          FROM
            ${DATA_TABLE}
        `;

        for (let i = 2; i <= numOfTables; i++) {
          DATA_COLUMN_QUERY += `
            INNER JOIN
            ${DATA_TABLE}_${i} USING (${COSMETIC_ID})
          `;
        }

        DATA_COLUMN_QUERY += ` ORDER BY ${COSMETIC_ID};\n`;

        const dataTableData = await db.query(DATA_COLUMN_QUERY);
        const insertedCosmeticId = (dataTableData.find((row) => row[ID] === id))[COSMETIC_ID];

        let INC_UPDATE_QUERY = '';

        dataTableData.forEach((row) => {
          const cellValue = row[column.column_name];
          if (row[COSMETIC_ID] >= insertedCosmeticId &&
              cellValue &&
              cellValue.search(/=/) === 0) {
            const newValue = incrementData(cellValue, type);

            INC_UPDATE_QUERY += `
              UPDATE ${column.table_name} 
              SET ${column.column_name} = '${newValue}'
              WHERE ${ID} = ${row[ID]};`;
          }
        });

        builtString += INC_UPDATE_QUERY;

        if (columnTableData[index + 1] === undefined) return builtString;

        const results = await forEachColumnThatHasExpression(req, columnTableData, numOfTables, index + 1, builtString);
        return results;
      } else {
        if (columnTableData[index + 1] === undefined) return builtString;
        const results = await forEachColumnThatHasExpression(req, columnTableData, numOfTables, index + 1, builtString);
        return results;
      }
    } catch (err) {
      return util.errorHandler({err: err, context: 'forEachColumnThatHasExpression'});
    }
  };

  try {
    const DATA_TABLE = req.body.data.gridName;
    const COLUMN_TABLE = gridGeneral.getCorrectColumnTable(req.body.data);

    const numOfTables = await gridGeneral.findNumberOfTables(db, DATA_TABLE);
    const columnTableData = await db.query(`SELECT * FROM ${COLUMN_TABLE};`);
    const results = await forEachColumnThatHasExpression(req, columnTableData, numOfTables);

    return results;
  } catch (err) {
    return util.errorHandler({err: err, context: 'getIncrementExpressionQuery'});
  }
};

async function addRow(req, res) {
  try {
    req.body.func = 'addRow';
    req.body.db = setDatabase(req.body.db);

    // await db.setReq(req);

    const id = req.body.data[ID];
    const replacementId = req.body.data.replacementId;
    const copy = req.body.data.copy;
    const insertAbove = req.body.data.insertAbove;
    const initialize = req.body.data.initialize;

    const DATA_TABLE = req.body.data.gridName;
    const STYLE_TABLE = DATA_TABLE + '_style';
    const COLUMN_TABLE = gridGeneral.getCorrectColumnTable(req.body.data);
    const numOfTables = await gridGeneral.findNumberOfTables(db, DATA_TABLE);

    if (initialize) {
      await db.query(`
        WITH t as (
          INSERT INTO ${DATA_TABLE} (${COSMETIC_ID}) VALUES (1)
          RETURNING ${COSMETIC_ID}, ${ID}
        )
        INSERT INTO ${STYLE_TABLE} (${COSMETIC_ID}, ${ID})
        SELECT t.${COSMETIC_ID}, t.${ID}
        FROM t;
      `);

      return res.status(200).json(security.encrypt({success: true, result: true}));
    }

    // increment primary keys for both data and style table and insert the new row in each table.
    let INSERT_ROW_QUERY = 'BEGIN; \n';

    for (let i = 0; i < numOfTables; i++) {
      if (i === 0) {
        INSERT_ROW_QUERY += `
          LOCK ${DATA_TABLE};
          LOCK ${STYLE_TABLE};
        `;
      } else {
        INSERT_ROW_QUERY += `
          LOCK ${DATA_TABLE}_${(i + 1)};
          LOCK ${STYLE_TABLE}_${(i + 1)};
        `;
      }
    }

    const columnTable = copy ? await db.query(`SELECT * FROM ${COLUMN_TABLE};`) : '';

    for (let i = 0; i < numOfTables; i++) {
      const currentDataTable = DATA_TABLE + (i === 0 ? '' : '_' + (i + 1));
      const currentStyleTable = STYLE_TABLE + (i === 0 ? '' : '_' + (i + 1));

      // increment data table
      INSERT_ROW_QUERY += `
        ALTER TABLE ${currentDataTable} DROP CONSTRAINT ${currentDataTable}_${COSMETIC_ID}_key;
        WITH t AS (
          SELECT ${COSMETIC_ID}
          FROM ${currentDataTable}
          WHERE ${ID} = ${id}
        )
        UPDATE ${currentDataTable} 
        SET ${COSMETIC_ID} = ${currentDataTable}.${COSMETIC_ID} + 1
        FROM t
        WHERE ${currentDataTable}.${COSMETIC_ID} ${insertAbove ? '>=' : '>'} t.${COSMETIC_ID};
        ALTER TABLE ${currentDataTable} ADD UNIQUE (${COSMETIC_ID});
      `;

      // increment style table
      INSERT_ROW_QUERY += `
        ALTER TABLE ${currentStyleTable} DROP CONSTRAINT ${currentStyleTable}_${COSMETIC_ID}_key;
        WITH t AS (
          SELECT ${COSMETIC_ID}
          FROM ${currentStyleTable}
          WHERE ${ID} = ${id}
        )
        UPDATE ${currentStyleTable} 
        SET ${COSMETIC_ID} = ${currentStyleTable}.${COSMETIC_ID} + 1
        FROM t
        WHERE ${currentStyleTable}.${COSMETIC_ID} ${insertAbove ? '>=' : '>'} t.${COSMETIC_ID};
        ALTER TABLE ${currentStyleTable} ADD UNIQUE (${COSMETIC_ID});
      `;

      // insert records
      INSERT_ROW_QUERY += `
        WITH t as (
          INSERT INTO ${currentDataTable} (${COSMETIC_ID}${replacementId ? `, ${ID}` : ''})
          SELECT ${COSMETIC_ID} ${insertAbove ? '-' : '+'} 1${replacementId ? `, ${replacementId}` : ''}
          FROM ${currentDataTable}
          WHERE ${ID} = ${id}
          RETURNING ${COSMETIC_ID}, ${ID}
        )
        INSERT INTO ${currentStyleTable} (${COSMETIC_ID}, ${ID})
        SELECT t.${COSMETIC_ID}, t.${ID}
        FROM t;
      `;

      if (copy) {
        // copy data for data
        const currTableColumns = columnTable.filter((column) => column.table_name === currentDataTable)
                                            .map((column) => column.column_name);

        INSERT_ROW_QUERY += `
          WITH t AS (
            WITH t2 AS (
              SELECT ${COSMETIC_ID} ${insertAbove ? '-' : '+'} 1 AS ${COSMETIC_ID}
              FROM ${currentDataTable}
              WHERE ${ID} = ${id}
            )
            SELECT ${COSMETIC_ID}, ${id} as target_id, id
            FROM ${currentDataTable}
            INNER JOIN t2 USING (grid_specific_id)
          )
          UPDATE ${currentDataTable}
          SET
        `;

        currTableColumns.forEach((column) => {
          if (column !== COSMETIC_ID && column !== ID) {
            INSERT_ROW_QUERY += `${column} = subquery.${column}, \n\t`;
          }
        });

        if (/,[\s]*$/.test(INSERT_ROW_QUERY)) {
          INSERT_ROW_QUERY = INSERT_ROW_QUERY.substring(0, INSERT_ROW_QUERY.length - 4) + ' \n\t';
        }

        INSERT_ROW_QUERY += 'FROM (\n\t\t' +
                            'SELECT \n\t\t\t' +
                            '  grid_specific_id,\n\t\t\t' +
                            '  id,\n\t\t\t';

        currTableColumns.forEach((column) => {
          if (column !== COSMETIC_ID && column !== ID) {
            INSERT_ROW_QUERY += `${column}, \n\t\t\t`;
          }
        });

        if (/,[\s]*$/.test(INSERT_ROW_QUERY)) {
          INSERT_ROW_QUERY = INSERT_ROW_QUERY.substring(0, INSERT_ROW_QUERY.length - 6) + ' \n\t\t\t';
        }

        INSERT_ROW_QUERY += `
          FROM ${currentDataTable}
          WHERE ${ID} = ${id}
          ) AS subquery
          INNER JOIN t ON subquery.${ID} = t.target_id
          WHERE ${currentDataTable}.${ID} = t.${ID};
        `;

        // copy data for style
        INSERT_ROW_QUERY += `
          WITH t AS (
            WITH t2 AS (
              SELECT ${COSMETIC_ID} ${insertAbove ? '-' : '+'} 1 AS ${COSMETIC_ID}
              FROM ${currentStyleTable}
              WHERE ${ID} = ${id}
            )
            SELECT ${COSMETIC_ID}, ${id} as target_id, id
            FROM ${currentStyleTable}
            INNER JOIN t2 USING (grid_specific_id)
          )
          UPDATE ${currentStyleTable}
          SET
        `;

        currTableColumns.forEach((column) => {
          if (column !== COSMETIC_ID && column !== ID) {
            INSERT_ROW_QUERY += `styleattrib_${column} = subquery.styleattrib_${column}, \n\t`;
          }
        });

        if (/,[\s]*$/.test(INSERT_ROW_QUERY)) {
          INSERT_ROW_QUERY = INSERT_ROW_QUERY.substring(0, INSERT_ROW_QUERY.length - 4) + ' \n\t';
        }

        INSERT_ROW_QUERY += 'FROM (\n\t\t' +
                            'SELECT \n\t\t\t' +
                            '  grid_specific_id,\n\t\t\t' +
                            '  id,\n\t\t\t';

        currTableColumns.forEach((column) => {
          if (column !== COSMETIC_ID && column !== ID) {
            INSERT_ROW_QUERY += `styleattrib_${column}, \n\t\t\t`;
          }
        });

        if (/,[\s]*$/.test(INSERT_ROW_QUERY)) {
          INSERT_ROW_QUERY = INSERT_ROW_QUERY.substring(0, INSERT_ROW_QUERY.length - 6) + ' \n\t\t\t';
        }

        INSERT_ROW_QUERY += `
          FROM ${currentStyleTable}
          WHERE ${ID} = ${id}
          ) AS subquery
          INNER JOIN t ON subquery.${ID} = t.target_id
          WHERE ${currentStyleTable}.${ID} = t.${ID};
        `;
      }
    };

    INSERT_ROW_QUERY += await getIncrementExpressionQuery(req, id);

    INSERT_ROW_QUERY += ' COMMIT; ';

    await db.query(INSERT_ROW_QUERY);

    if (req.body.changeLog) {
      try {
        const newState = await gridGeneral.getDataStyleConcatRecord(db, DATA_TABLE, id, numOfTables);
        const insertChangeObj = {
          db: db,
          mainTable: `'${DATA_TABLE}'`,
          func: `'${req.body.func}'`,
          columnAffected: null,
          oldState: null,
          newState: `'${gridGeneral.prepObjForSql(newState)}'`,
          username: `'${req.user.username}'`
        };
        await gridGeneral.insertChange(insertChangeObj);
      } catch (err) {
        console.log(err);
        console.log('insertChange failed.');
      }
    }

    return res.status(200).json(security.encrypt({success: true, result: true}));
  } catch (err) {
    return res.status(200).json(security.encrypt({success: false, result: {msg: DEFAULT_ERROR_MESSAGE + ' Error Code: 14', critical: true, result: util.errorHandler({err: err, context: 'addRow', isLast: true})}}));
  }
}

async function removeRow(req, res) {
  try {
    req.body.func = 'removeRow';
    req.body.db = setDatabase(req.body.db);

    // await db.setReq(req);

    const id = req.body.data[ID];

    const DATA_TABLE = req.body.data.gridName;
    const STYLE_TABLE = DATA_TABLE + '_style';
    const numOfTables = await gridGeneral.findNumberOfTables(db, DATA_TABLE);

    // increment primary keys for both data and style table and insert the new row in each table.
    let DELETE_ROW_QUERY = 'BEGIN; ';

    for (let i = 0; i < numOfTables; i++) {
      if (i === 0) {
        DELETE_ROW_QUERY += `
          LOCK ${DATA_TABLE};
          LOCK ${STYLE_TABLE};
        `;
      } else {
        DELETE_ROW_QUERY += `
          LOCK ${DATA_TABLE}_${(i + 1)};
          LOCK ${STYLE_TABLE}_${(i + 1)};
        `;
      }
    }

    for (let i = 0; i < numOfTables; i++) {
      const currentDataTable = DATA_TABLE + (i === 0 ? '' : '_' + (i + 1));
      const currentStyleTable = STYLE_TABLE + (i === 0 ? '' : '_' + (i + 1));

      DELETE_ROW_QUERY += `
        ALTER TABLE ${currentDataTable} DROP CONSTRAINT ${currentDataTable}_${COSMETIC_ID}_key;
        WITH t AS (
          SELECT ${COSMETIC_ID}
          FROM ${currentDataTable}
          WHERE ${ID} = ${id}
        )
        UPDATE ${currentDataTable} 
        SET ${COSMETIC_ID} = ${currentDataTable}.${COSMETIC_ID} - 1 
        FROM t
        WHERE ${currentDataTable}.${COSMETIC_ID} > t.${COSMETIC_ID};

        ALTER TABLE ${currentStyleTable} DROP CONSTRAINT ${currentStyleTable}_${COSMETIC_ID}_key;
        WITH t AS (
          SELECT ${COSMETIC_ID}
          FROM ${currentStyleTable}
          WHERE ${ID} = ${id}
        )
        UPDATE ${currentStyleTable} 
        SET ${COSMETIC_ID} = ${currentStyleTable}.${COSMETIC_ID} - 1 
        FROM t
        WHERE ${currentStyleTable}.${COSMETIC_ID} > t.${COSMETIC_ID};

        DELETE FROM ${currentDataTable} WHERE ${ID} = ${id};
        ALTER TABLE ${currentDataTable} ADD UNIQUE (${COSMETIC_ID});
        ALTER TABLE ${currentStyleTable} ADD UNIQUE (${COSMETIC_ID});
      `;
    }

    let results = await getIncrementExpressionQuery(req, id, 'dec');

    DELETE_ROW_QUERY += results;

    DELETE_ROW_QUERY += ' COMMIT; ';

    let oldState = [];

    if (req.body.changeLog) {
      try {
        oldState = await gridGeneral.getDataStyleConcatRecord(db, DATA_TABLE, id, numOfTables);
      } catch (err) {
        console.log(err);
        console.log('getDataStyleConcatRecord failed.');
      }
    }

    results = await db.query(DELETE_ROW_QUERY);

    if (req.body.changeLog) {
      try {
        const insertChangeObj = {
          db: db,
          mainTable: `'${DATA_TABLE}'`,
          func: `'${req.body.func}'`,
          columnAffected: null,
          oldState: `'${gridGeneral.prepObjForSql(oldState)}'`,
          newState: null,
          username: `'${req.user.username}'`
        };
        await gridGeneral.insertChange(insertChangeObj);
      } catch (err) {
        console.log(err);
        console.log('insertChange failed.');
      }
    }

    return res.status(200).json(security.encrypt({success: true, result: true}));
  } catch (err) {
    return res.status(200).json(security.encrypt({success: false, result: {msg: DEFAULT_ERROR_MESSAGE + ' Error Code: 15', critical: true, result: util.errorHandler({err: err, context: 'removeRow', isLast: true})}}));
  }
}

async function addColumn(req, res) {
  const generateAddColumnsQuery = (req, tableNumber, columnIndex, columnName) => {
    const DATA_TABLE = req.body.data.gridName;
    const STYLE_TABLE = DATA_TABLE + '_style';
    const COLUMN_TABLE = gridGeneral.getCorrectColumnTable(req.body.data);

    let tableName;
    let styleTableName;

    if (tableNumber === 1) {
      tableName = DATA_TABLE;
      styleTableName = STYLE_TABLE;
    } else {
      tableName = DATA_TABLE + '_' + String(tableNumber);
      styleTableName = STYLE_TABLE + '_' + String(tableNumber);
    }

    /*
      adds the data table and style table columns.
      also adds the cooresponding record from the columns table and increments
      the id of all other records.
    */
    return `
      BEGIN;
      ALTER TABLE ${tableName} ADD COLUMN ${columnName} character varying(${MAX_CHARACTERS_PER_DATA}) COLLATE pg_catalog."default" DEFAULT ''::character varying;
      ALTER TABLE ${styleTableName} ADD COLUMN styleattrib_${columnName} character varying(${MAX_CHARACTERS_PER_STYLE}) COLLATE pg_catalog."default" DEFAULT ''::character varying;
      LOCK ${COLUMN_TABLE};
      ALTER TABLE ${COLUMN_TABLE} DROP CONSTRAINT ${COLUMN_TABLE}_pkey;
      UPDATE ${COLUMN_TABLE} SET id = id + 1 WHERE id >= ${columnIndex};
      ALTER TABLE ${COLUMN_TABLE} ADD CONSTRAINT ${COLUMN_TABLE}_pkey PRIMARY KEY(id);
      INSERT INTO ${COLUMN_TABLE} (id, column_name, hide, table_name) VALUES (${columnIndex}, '${columnName}', false, '${tableName}');
      COMMIT;
    `;
  };

  const generateCreateNewTablesQuery = (req, tableNumber) => {
    const DATA_TABLE = req.body.data.gridName;
    const STYLE_TABLE = DATA_TABLE + '_style';

    const NEW_TABLE_NAME = DATA_TABLE + '_' + String(tableNumber);
    const NEW_STYLE_TABLE_NAME = STYLE_TABLE + '_' + String(tableNumber);

    return `
      CREATE TABLE ${NEW_TABLE_NAME}
      (
        ${ID} serial PRIMARY KEY
        ${COSMETIC_ID} integer NOT NULL UNIQUE,
      )
      WITH (
        OIDS = FALSE
      )
      TABLESPACE pg_default;

      ALTER TABLE ${NEW_TABLE_NAME}
        OWNER to ${postgresqlOwner};

      INSERT INTO ${NEW_TABLE_NAME} (${COSMETIC_ID})
      SELECT ${COSMETIC_ID}
      FROM ${DATA_TABLE};

      CREATE TABLE ${NEW_STYLE_TABLE_NAME}
      (
        id integer NOT NULL REFERENCES ${NEW_TABLE_NAME}(id),
        ${COSMETIC_ID} integer NOT NULL UNIQUE
      )
      WITH (
        OIDS = FALSE
      )
      TABLESPACE pg_default;

      ALTER TABLE ${NEW_STYLE_TABLE_NAME}
        OWNER to ${postgresqlOwner};

      INSERT INTO ${NEW_STYLE_TABLE_NAME} (${COSMETIC_ID})
      SELECT ${COSMETIC_ID}
      FROM ${STYLE_TABLE};
    `;
  };

  const generateCopyColumnsQuery = async (req, columnIndex) => {
    try {
      const INSERT_LEFT = req.body.data.insertLeft;
      const COLUMN_DATA = await db.query(`SELECT * FROM ${gridGeneral.getCorrectColumnTable(req.body.data)} ORDER BY id;`);

      const currColumn = COLUMN_DATA[columnIndex];
      let prevColumn;

      if (INSERT_LEFT) {
        prevColumn = COLUMN_DATA[columnIndex + 1];
      } else {
        prevColumn = COLUMN_DATA[columnIndex - 1];
      }

      return `
        UPDATE ${currColumn.table_name} first
        SET ${currColumn.column_name} = ( 
          SELECT ${prevColumn.column_name}
          FROM ${prevColumn.table_name} second
          WHERE first.${ID} = second.${ID});

        UPDATE ${gridGeneral.getStyleTableName(currColumn.table_name)} first
        SET styleattrib_${currColumn.column_name} = ( 
          SELECT styleattrib_${prevColumn.column_name}
          FROM ${gridGeneral.getStyleTableName(prevColumn.table_name)} second
          WHERE first.${ID} = second.${ID});
      `;
    } catch (err) {
      return util.errorHandler({err: err, context: 'generateCopyColumnsQuery'});
    }
  };

  try {
    req.body.func = 'addColumn';
    req.body.db = setDatabase(req.body.db);

    // await db.setReq(req);

    let columnName = security.sanitize(req.body.data.columnName, MAX_CHARACTERS_PER_HEADER_NAME);
    const columnIndex = req.body.data.columnIndex;

    const DATA_TABLE = req.body.data.gridName;
    const suppressTableSplit = req.body.data.suppressTableSplit;

    columnName = gridGeneral.convertStringWithNumbersToWords(columnName);
    columnName = columnName.replace(/'/g, `''`);

    let tableNumber = await gridGeneral.findNumberOfTables(db, DATA_TABLE);
    if (!tableNumber) throw 'Error in findNumberOfTables';

    let COLUMNS_QUERY = '';

    if (tableNumber !== 1) {
      COLUMNS_QUERY = `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = '${DATA_TABLE}_${String(tableNumber)}'`;
    } else {
      COLUMNS_QUERY = `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = '${DATA_TABLE}'`;
    }

    const results = await db.query(COLUMNS_QUERY);

    if (!suppressTableSplit && results[0].count >= MAX_COLUMNS_PER_TABLE) {
      tableNumber++;

      const CREATE_NEW_TABLES_QUERY = generateCreateNewTablesQuery(req, tableNumber);
      await db.query(CREATE_NEW_TABLES_QUERY);

      const ADD_COLUMNS_QUERY = generateAddColumnsQuery(req, tableNumber, columnIndex, columnName);
      await db.query(ADD_COLUMNS_QUERY);
    } else {
      const ADD_COLUMNS_QUERY = generateAddColumnsQuery(req, tableNumber, columnIndex, columnName);
      await db.query(ADD_COLUMNS_QUERY);
    }

    if (req.body.data.copy) {
      const COPY_DATA_QUERY = await generateCopyColumnsQuery(req, columnIndex);
      await db.query(COPY_DATA_QUERY);
    }

    if (req.body.changeLog) {
      try {
        const newState = await gridGeneral.getColumnRecord(db, DATA_TABLE, columnName);
        const insertChangeObj = {
          db: db,
          mainTable: `'${DATA_TABLE}'`,
          func: `'${req.body.func}'`,
          columnAffected: null,
          oldState: null,
          newState: `'${gridGeneral.prepObjForSql(newState)}'`,
          username: `'${req.user.username}'`
        };
        await gridGeneral.insertChange(insertChangeObj);
      } catch (err) {
        console.log(err);
        console.log('insertChange failed.');
      }
    }

    return res.status(200).json(security.encrypt({success: true, result: true}));
  } catch (err) {
    return res.status(200).json(security.encrypt({success: false, result: {msg: DEFAULT_ERROR_MESSAGE + ' Error Code: 16', critical: true, result: util.errorHandler({err: err, context: 'addColumn', isLast: true})}}));
  }
}

async function removeColumn(req, res) {
  try {
    req.body.func = 'removeColumn';
    req.body.db = setDatabase(req.body.db);

    // await db.setReq(req);

    const columnName = req.body.data.columnName;

    const DATA_TABLE = req.body.data.gridName;
    const STYLE_TABLE = DATA_TABLE + '_style';
    const COLUMN_TABLE = gridGeneral.getCorrectColumnTable(req.body.data);

    const columnDefs = await gridGeneral.getColumnTable(db, COLUMN_TABLE);

    let dataTable;
    let styleTable;

    for (let i = 0; i < columnDefs.length; i++) {
      if (columnDefs[i].column_name === columnName) {
        dataTable = columnDefs[i].table_name;
        styleTable = columnDefs[i].table_name;
      }
    }

    // generate styleTable from dataTable
    const pos = styleTable.search(/_\d+/);
    if (pos !== -1) {
      const num = styleTable.slice(pos + 1, styleTable.length);
      styleTable = styleTable.replace(/_\d+/, '_style_' + num);
    } else {
      styleTable += '_style';
    }

    let query = `SELECT id FROM ${COLUMN_TABLE} WHERE column_name = '${columnName}';`;
    let results = await db.query(query);

    const id = results[0].id;

    /*
      drops the data table and style table columns.
      also removes the cooresponding record from the columns table and decrements
      the id of all other records.
    */
    const REMOVE_COLUMNS_QUERY = `
      BEGIN;
      ALTER TABLE ${dataTable} DROP COLUMN ${columnName};
      ALTER TABLE ${styleTable} DROP COLUMN styleattrib_${columnName};
      LOCK ${COLUMN_TABLE};
      DELETE FROM ${COLUMN_TABLE} WHERE id = ${id};
      ALTER TABLE ${COLUMN_TABLE} DROP CONSTRAINT ${COLUMN_TABLE}_pkey;
      UPDATE ${COLUMN_TABLE} SET id = id - 1 WHERE id >= ${id};
      ALTER TABLE ${COLUMN_TABLE} ADD CONSTRAINT ${COLUMN_TABLE}_pkey PRIMARY KEY(id);
      COMMIT;
    `;

    let oldState = [];

    if (req.body.changeLog) {
      try {
        oldState = await gridGeneral.getColumnRecord(db, DATA_TABLE, columnName);
      } catch (err) {
        console.log(err);
        console.log('getColumnRecord failed.');
      }
    }

    results = await db.query(REMOVE_COLUMNS_QUERY);

    if (req.body.changeLog) {
      try {
        const insertChangeObj = {
          db: db,
          mainTable: `'${DATA_TABLE}'`,
          func: `'${req.body.func}'`,
          columnAffected: null,
          oldState: `'${gridGeneral.prepObjForSql(oldState)}'`,
          newState: null,
          username: `'${req.user.username}'`
        };
        await gridGeneral.insertChange(insertChangeObj);
      } catch (err) {
        console.log(err);
        console.log('insertChange failed.');
      }
    }

    // if the table deleted from only contains the COSMETIC_ID, drop the table.
    query = `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = '${dataTable}';`;
    results = await db.query(query);
    if (results[0].count >= 2 || dataTable === DATA_TABLE || styleTable === STYLE_TABLE) return res.status(200).json(security.encrypt({success: true, result: true}));

    query = `
      DROP TABLE ${dataTable} CASCADE;
      DROP TABLE ${styleTable};
    `;

    results = await db.query(query);

    return res.status(200).json(security.encrypt({success: true, result: true}));
  } catch (err) {
    return res.status(200).json(security.encrypt({success: false, result: {msg: DEFAULT_ERROR_MESSAGE + ' Error Code: 17', critical: true, result: util.errorHandler({err: err, context: 'removeColumn', isLast: true})}}));
  }
}

async function renameColumn(req, res) {
  try {
    req.body.func = 'renameColumn';
    req.body.db = setDatabase(req.body.db);

    // await db.setReq(req);

    const oldColumnName = req.body.data.oldColumnName;
    let newColumnName = security.sanitize(req.body.data.newColumnName, MAX_CHARACTERS_PER_HEADER_NAME);

    const COLUMN_TABLE = gridGeneral.getCorrectColumnTable(req.body.data);

    if (/[^a-z_\d]+/.test(newColumnName)) {
      return res.status(200).json(security.encrypt({success: true, result: {message: `Column name not changed. The column name had a bad character in it.`}}));
    }

    newColumnName = gridGeneral.convertStringWithNumbersToWords(newColumnName);

    if (oldColumnName === newColumnName) return res.status(200).json(security.encrypt({success: true, result: {message: 'Column name not changed. The column already has that name.'}}));

    const columnDefs = await gridGeneral.getColumnTable(db, COLUMN_TABLE);

    let found = false;

    for (let i = 0; i < columnDefs.length; i++) {
      if (columnDefs[i].column_name === newColumnName) {
        found = true;
        break;
      }
    }

    if (!found) {
      let dataTable;
      let styleTable;

      for (let i = 0; i < columnDefs.length; i++) {
        if (columnDefs[i].column_name === oldColumnName) {
          dataTable = columnDefs[i].table_name;
          styleTable = columnDefs[i].table_name;
        }
      }

      // generate styleTable from dataTable
      const pos = styleTable.search(/_\d+/);
      if (pos !== -1) {
        const num = styleTable.slice(pos + 1, styleTable.length);
        styleTable = styleTable.replace(/_\d+/, '_style_' + num);
      } else {
        styleTable += '_style';
      }

      const RENAME_COLUMN_QUERY = `
        BEGIN;
        ALTER TABLE ${dataTable} RENAME COLUMN ${oldColumnName} to ${newColumnName};
        ALTER TABLE ${styleTable} RENAME COLUMN styleattrib_${oldColumnName} to styleattrib_${newColumnName};
        UPDATE ${COLUMN_TABLE} SET column_name = '${newColumnName}' WHERE column_name = '${oldColumnName}';
        COMMIT;
      `;

      let oldState = [];

      if (req.body.changeLog) {
        try {
          oldState = await gridGeneral.getColumnRecord(db, req.body.data.gridName, oldColumnName);
        } catch (err) {
          console.log(err);
          console.log('insertChange failed.');
        }
      }

      await db.query(RENAME_COLUMN_QUERY);

      if (req.body.changeLog) {
        try {
          const newState = JSON.parse(JSON.stringify(oldState));
          newState.column_name = newColumnName;
          const insertChangeObj = {
            db: db,
            mainTable: `'${req.body.data.gridName}'`,
            func: `'${req.body.func}'`,
            columnAffected: `'column_name'`,
            oldState: `'${gridGeneral.prepObjForSql(oldState)}'`,
            newState: `'${gridGeneral.prepObjForSql(newState)}'`,
            username: `'${req.user.username}'`
          };
          await gridGeneral.insertChange(insertChangeObj);
        } catch (err) {
          console.log(err);
          console.log('insertChange failed.');
        }
      }

      return res.status(200).json(security.encrypt({success: true, result: true}));
    } else {
      return res.status(200).json(security.encrypt({success: true, result: {message: 'Column name not changed. There is already a column with that name.'}}));
    }
  } catch (err) {
    return res.status(200).json(security.encrypt({success: false, result: {msg: DEFAULT_ERROR_MESSAGE + ' Error Code: 18', critical: true, result: util.errorHandler({err: err, context: 'renameColumn', isLast: true})}}));
  }
}

async function setCustomHeaderName(req, res) {
  try {
    req.body.func = 'setCustomHeaderName';
    req.body.db = setDatabase(req.body.db);

    // await db.setReq(req);

    let columnName = req.body.data.columnName;
    columnName = gridGeneral.convertStringWithNumbersToWords(columnName);
    let customHeaderName = security.sanitize(req.body.data.customHeaderName, MAX_CHARACTERS_PER_HEADER_NAME);

    const COLUMN_TABLE = gridGeneral.getCorrectColumnTable(req.body.data);

    customHeaderName = customHeaderName.replace(/'/g, `''`);

    const SET_CUSTOM_HEADER_NAME_QUERY = `
      UPDATE ${COLUMN_TABLE}
      SET custom_header_name = '${customHeaderName}'
      WHERE column_name = '${columnName}';
    `;

    let oldState = [];

    if (req.body.changeLog) {
      try {
        oldState = await gridGeneral.getColumnRecord(db, req.body.data.gridName, columnName);
      } catch (err) {
        console.log(err);
        console.log('getColumnRecord failed.');
      }
    }

    await db.query(SET_CUSTOM_HEADER_NAME_QUERY);

    if (req.body.changeLog) {
      try {
        const newState = JSON.parse(JSON.stringify(oldState));
        newState.custom_header_name = security.sanitize(req.body.data.customHeaderName, MAX_CHARACTERS_PER_HEADER_NAME);
        const insertChangeObj = {
          db: db,
          mainTable: `'${req.body.data.gridName}'`,
          func: `'${req.body.func}'`,
          columnAffected: `'custom_header_name'`,
          oldState: `'${gridGeneral.prepObjForSql(oldState)}'`,
          newState: `'${gridGeneral.prepObjForSql(newState)}'`,
          username: `'${req.user.username}'`
        };
        await gridGeneral.insertChange(insertChangeObj);
      } catch (err) {
        console.log(err);
        console.log('insertChange failed.');
      }
    }

    return res.status(200).json(security.encrypt({success: true, result: true}));
  } catch (err) {
    return res.status(200).json(security.encrypt({success: false, result: {msg: DEFAULT_ERROR_MESSAGE + ' Error Code: 19', critical: true, result: util.errorHandler({err: err, context: 'setCustomHeaderName', isLast: true})}}));
  }
}

async function hideColumn(req, res) {
  try {
    req.body.func = 'hideColumn';
    req.body.db = setDatabase(req.body.db);

    // await db.setReq(req);

    const columnName = req.body.data.columnName;
    const hide = req.body.data.hide;

    const COLUMN_TABLE = gridGeneral.getCorrectColumnTable(req.body.data);

    const HIDE_COLUMN_QUERY = `UPDATE ${COLUMN_TABLE} SET hide = ${hide} WHERE column_name = '${columnName}';`;

    let oldState = [];

    if (req.body.changeLog) {
      try {
        oldState = await gridGeneral.getColumnRecord(db, req.body.data.gridName, columnName);
      } catch (err) {
        console.log(err);
        console.log('getColumnRecord failed.');
      }
    }

    await db.query(HIDE_COLUMN_QUERY);

    if (req.body.changeLog) {
      try {
        const newState = JSON.parse(JSON.stringify(oldState));
        newState.hide = hide;
        const insertChangeObj = {
          db: db,
          mainTable: `'${req.body.data.gridName}'`,
          func: `'${req.body.func}'`,
          columnAffected: `'hide'`,
          oldState: `'${gridGeneral.prepObjForSql(oldState)}'`,
          newState: `'${gridGeneral.prepObjForSql(newState)}'`,
          username: `'${req.user.username}'`
        };
        await gridGeneral.insertChange(insertChangeObj);
      } catch (err) {
        console.log(err);
        console.log('insertChange failed.');
      }
    }

    return res.status(200).json(security.encrypt({success: true, result: true}));
  } catch (err) {
    return res.status(200).json(security.encrypt({success: false, result: {msg: DEFAULT_ERROR_MESSAGE + ' Error Code: 20', critical: true, result: util.errorHandler({err: err, context: 'hideColumn', isLast: true})}}));
  }
}

async function pinColumn(req, res) {
  try {
    req.body.func = 'pinColumn';
    req.body.db = setDatabase(req.body.db);

    // await db.setReq(req);

    const columns = req.body.data.columns;
    const pinned = req.body.data.pinned;

    const COLUMN_TABLE = gridGeneral.getCorrectColumnTable(req.body.data);

    let PIN_COLUMN_QUERY = '';

    const oldStates = [];
    const newStates = [];

    for (let i = 0; i < columns.length; i++) {
      PIN_COLUMN_QUERY = `${PIN_COLUMN_QUERY} UPDATE ${COLUMN_TABLE} SET pinned = '${pinned}' WHERE column_name = '${columns[i]}';`;

      if (req.body.changeLog) {
        try {
          oldStates.push(await gridGeneral.getColumnRecord(db, req.body.data.gridName, columns[i]));
          newStates.push(JSON.parse(JSON.stringify(oldStates[oldStates.length - 1])));
          newStates[newStates.length - 1].pinned = pinned;
        } catch (err) {
          console.log(err);
          console.log('getColumnRecord failed.');
        }
      }
    }

    await db.query(PIN_COLUMN_QUERY);

    if (req.body.changeLog) {
      for (let i = 0; i < oldStates.length; i++) {
        try {
          const insertChangeObj = {
            db: db,
            mainTable: `'${req.body.data.gridName}'`,
            func: `'${req.body.func}'`,
            columnAffected: `'pinned'`,
            oldState: `'${gridGeneral.prepObjForSql(oldStates[i])}'`,
            newState: `'${gridGeneral.prepObjForSql(newStates[i])}'`,
            username: `'${req.user.username}'`
          };
          await gridGeneral.insertChange(insertChangeObj);
        } catch (err) {
          console.log(err);
          console.log('insertChange failed.');
        }
      }
    }

    return res.status(200).json(security.encrypt({success: true, result: true}));
  } catch (err) {
    return res.status(200).json(security.encrypt({success: false, result: {msg: DEFAULT_ERROR_MESSAGE + ' Error Code: 21', critical: true, result: util.errorHandler({err: err, context: 'pinColumn', isLast: true})}}));
  }
}

async function forceProperty(req, res) {
  try {
    req.body.func = 'forceProperty';
    req.body.db = setDatabase(req.body.db);

    // await db.setReq(req);

    const property = req.body.data.property.toLowerCase();
    const force = req.body.data.force;
    const columnName = req.body.data.columnName;

    const COLUMN_TABLE = gridGeneral.getCorrectColumnTable(req.body.data);

    let modColumn;

    switch (property) {
      case 'uppercase':
        modColumn = 'to_upper';
        break;
      case 'currencyformat':
        modColumn = 'to_currency';
        break;
      case 'dateformat':
        modColumn = 'to_date';
        break;
      case 'editable':
        modColumn = 'editable';
        break;
      case 'adminonly':
        modColumn = 'admin_only';
        break;
      default:
        throw 'Not a proper case for property';
    }

    const FORCE_PROPERTY_QUERY = `UPDATE ${COLUMN_TABLE} SET ${modColumn} = ${force} WHERE column_name = '${columnName}';`;

    let oldState = [];

    if (req.body.changeLog) {
      try {
        oldState = await gridGeneral.getColumnRecord(db, req.body.data.gridName, columnName);
      } catch (err) {
        console.log(err);
        console.log('getColumnRecord failed.');
      }
    }

    await db.query(FORCE_PROPERTY_QUERY);

    if (req.body.changeLog) {
      try {
        const newState = JSON.parse(JSON.stringify(oldState));
        newState.modColumn = force;
        const insertChangeObj = {
          db: db,
          mainTable: `'${req.body.data.gridName}'`,
          func: `'${req.body.func}'`,
          columnAffected: `'${modColumn}'`,
          oldState: `'${gridGeneral.prepObjForSql(oldState)}'`,
          newState: `'${gridGeneral.prepObjForSql(newState)}'`,
          username: `'${req.user.username}'`
        };
        await gridGeneral.insertChange(insertChangeObj);
      } catch (err) {
        console.log(err);
        console.log('insertChange failed.');
      }
    }

    return res.status(200).json(security.encrypt({success: true, result: true}));
  } catch (err) {
    return res.status(200).json(security.encrypt({success: false, result: {msg: DEFAULT_ERROR_MESSAGE + ' Error Code: 22', critical: true, result: util.errorHandler({err: err, context: 'forceProperty', isLast: true})}}));
  }
}

async function setColumnWidth(req, res) {
  try {
    req.body.func = 'setColumnWidth';
    req.body.db = setDatabase(req.body.db);

    // await db.setReq(req);

    const colId = req.body.data.colId;
    const width = req.body.data.width;

    const COLUMN_TABLE = gridGeneral.getCorrectColumnTable(req.body.data);

    const SET_COLUMN_WIDTH_QUERY = `UPDATE ${COLUMN_TABLE} SET width = ${width} WHERE column_name = '${colId}';`;

    let oldState = [];

    if (req.body.changeLog) {
      try {
        oldState = await gridGeneral.getColumnRecord(db, req.body.data.gridName, colId);
      } catch (err) {
        console.log(err);
        console.log('getColumnRecord failed.');
      }
    }

    await db.query(SET_COLUMN_WIDTH_QUERY);

    if (req.body.changeLog) {
      try {
        const newState = JSON.parse(JSON.stringify(oldState));
        newState.width = width;
        const insertChangeObj = {
          db: db,
          mainTable: `'${req.body.data.gridName}'`,
          func: `'${req.body.func}'`,
          columnAffected: `'width'`,
          oldState: `'${gridGeneral.prepObjForSql(oldState)}'`,
          newState: `'${gridGeneral.prepObjForSql(newState)}'`,
          username: `'${req.user.username}'`
        };
        await gridGeneral.insertChange(insertChangeObj);
      } catch (err) {
        console.log(err);
        console.log('insertChange failed.');
      }
    }

    return res.status(200).json(security.encrypt({success: true, result: true}));
  } catch (err) {
    return res.status(200).json(security.encrypt({success: false, result: {msg: DEFAULT_ERROR_MESSAGE + ' Error Code: 23', critical: true, result: util.errorHandler({err: err, context: 'setColumnWidth', isLast: true})}}));
  }
}

async function setHorizontalFormula(req, res) {
  try {
    req.body.func = 'setHorizontalFormula';
    req.body.db = setDatabase(req.body.db);

    // await db.setReq(req);

    const colId = req.body.data.colId;
    const formula = req.body.data.formula;

    const COLUMN_TABLE = gridGeneral.getCorrectColumnTable(req.body.data);

    const SET_HORIZONTAL_FORMULA_QUERY = `UPDATE ${COLUMN_TABLE} SET horizontal_formula = '${formula}' WHERE column_name = '${colId}';`;

    let oldState = [];

    if (req.body.changeLog) {
      try {
        oldState = await gridGeneral.getColumnRecord(db, req.body.data.gridName, colId);
      } catch (err) {
        console.log(err);
        console.log('getColumnRecord failed.');
      }
    }

    await db.query(SET_HORIZONTAL_FORMULA_QUERY);

    if (req.body.changeLog) {
      try {
        const newState = JSON.parse(JSON.stringify(oldState));
        newState.horizontal_formula = formula;
        const insertChangeObj = {
          db: db,
          mainTable: `'${req.body.data.gridName}'`,
          func: `'${req.body.func}'`,
          columnAffected: `'horizontal_formula'`,
          oldState: `'${gridGeneral.prepObjForSql(oldState)}'`,
          newState: `'${gridGeneral.prepObjForSql(newState)}'`,
          username: `'${req.user.username}'`
        };
        await gridGeneral.insertChange(insertChangeObj);
      } catch (err) {
        console.log(err);
        console.log('insertChange failed.');
      }
    }

    return res.status(200).json(security.encrypt({success: true, result: true}));
  } catch (err) {
    return res.status(200).json(security.encrypt({success: false, result: {msg: DEFAULT_ERROR_MESSAGE + ' Error Code: 24', critical: true, result: util.errorHandler({err: err, context: 'setHorizontalFormula', isLast: true})}}));
  }
}

async function copyFormulaDownColumn(req, res) {
  const batchQuery = (query) => {
    let semicolons = 0;
    let lastPos = 0;
    const arrayOfQueries = [];

    for (let i = 0; i < query.length; i++) {
      if (query[i] === ';') {
        semicolons++;
      }

      if (semicolons >= 50) {
        semicolons = 0;

        arrayOfQueries.push(query.slice(lastPos, i+1));
        lastPos = i+1;
      }

      if (i >= query.length - 1 && query.slice(lastPos, i+1) !== '') {
        arrayOfQueries.push(query.slice(lastPos, i+1));
      }
    }

    return arrayOfQueries;
  };

  const incrementData = (str, inc) => {
    const strParts = [];
    let pos = -1;

    do {
      pos = str.search(/[\d]+/);

      if (pos === -1) {
        strParts.push(str);
        str = '';
      } else if (pos === 0) {
        pos = str.search(/[\D]+/);

        if (pos === -1) {
          strParts.push(str);
          str = '';
        } else {
          strParts.push(str.substring(0, pos));
          str = str.substring(pos);
        }
      } else {
        strParts.push(str.substring(0, pos));
        str = str.substring(pos);
      }
    } while (str !== '');

    let newString = '';

    for (let i = 0; i < strParts.length; i++) {
      if (/\d/.test(strParts[i]) && /[a-z]+/.test(strParts[i - 1])) {
        newString += String(parseInt(strParts[i]) + inc);
      } else {
        newString += strParts[i];
      }
    }

    return newString;
  };

  try {
    req.body.func = 'copyFormulaDownColumn';
    req.body.db = setDatabase(req.body.db);

    // await db.setReq(req);

    const colId = req.body.data.columnName;
    const rowOneFormula = req.body.data.rowOneFormula;

    const DATA_TABLE = req.body.data.gridName;
    const COLUMN_TABLE = gridGeneral.getCorrectColumnTable(req.body.data);

    let query = `SELECT table_name FROM ${COLUMN_TABLE} WHERE column_name = '${colId}';`;
    let trueTableName = await db.query(query);
    trueTableName = trueTableName[0].table_name;

    query = `SELECT COUNT(${COSMETIC_ID}) FROM ${DATA_TABLE};`;
    let numberOfRows = await db.query(query);
    numberOfRows = numberOfRows[0].count;

    let UPDATE_QUERY = '';

    for (let i = 1; i <= parseInt(numberOfRows); i++) {
      let newFormula;

      if (i === 1) {
        newFormula = rowOneFormula;
      } else {
        newFormula = incrementData(rowOneFormula, i - 1);
      }

      UPDATE_QUERY += `UPDATE ${trueTableName} SET ${colId} = '${newFormula}' WHERE ${COSMETIC_ID} = ${i};`;
    }

    const queries = batchQuery(UPDATE_QUERY);

    console.log(queries);

    for (let i = 0; i < queries.length; i++) {
      query = queries[i];
      await db.query(query);
      console.log('batch ' + i + ' complete');
    }

    return res.status(200).json(security.encrypt({success: true, result: true}));
  } catch (err) {
    return res.status(200).json(security.encrypt({success: false, result: {msg: DEFAULT_ERROR_MESSAGE + ' Error Code: 25', critical: true, result: util.errorHandler({err: err, context: 'copyFormulaDownColumn', isLast: true})}}));
  }
}

async function setColumnData(req, res) {
  try {
    req.body.func = 'setColumnData';
    req.body.db = setDatabase(req.body.db);

    // await db.setReq(req);

    const colId = req.body.data.colId;
    const rowData = req.body.data.rowData;

    const COLUMN_TABLE = gridGeneral.getCorrectColumnTable(req.body.data);

    const query = `SELECT table_name FROM ${COLUMN_TABLE} WHERE column_name = '${colId}';`;
    let trueTableName = await db.query(query);
    trueTableName = trueTableName[0].table_name;

    let UPDATE_QUERY = '';

    for (let i = 0; i < rowData.length; i++) {
      UPDATE_QUERY += `UPDATE ${trueTableName} SET ${colId} = '${rowData[i]}' WHERE ${COSMETIC_ID} = ${(i + 1)};`;
    }

    await db.query(UPDATE_QUERY);

    return res.status(200).json(security.encrypt({success: true, result: true}));
  } catch (err) {
    return res.status(200).json(security.encrypt({success: false, result: {msg: DEFAULT_ERROR_MESSAGE + ' Error Code: 26', critical: true, result: util.errorHandler({err: err, context: 'setColumnData', isLast: true})}}));
  }
}

async function appendAgGridSpreadsheetRecord(req, res) {
  try {
    req.body.func = 'appendAgGridSpreadsheetRecord';
    req.body.db = setDatabase(req.body.db);

    // await db.setReq(req);

    const nextGridSpecificId = await gridGeneral.getNextGridSpecificId(db, req.body.gridName);
    const columns = await gridGeneral.getColumnTable(db, `${req.body.gridName}_columns`);
    const distinctTables = gridGeneral.getDistinctTablesFromColumnTable(columns);

    let combinedQuery = '';

    distinctTables.forEach((table) => {
      let firstPart = `INSERT INTO ${table} (${COSMETIC_ID},`;
      let secondPart = `)\nVALUES (${nextGridSpecificId},`;
      let stylePart = '';

      for (const [key, value] of Object.entries(req.body.data)) {
        let nonColumnKeyOverride = false;

        for (let i = 0; i < req.body.nonColumnTableKeys.length; i++) {
          if (req.body.nonColumnTableKeys[i] === key) {
            nonColumnKeyOverride = true;
            break;
          }
        }

        if (gridGeneral.isColumnInTable(key, table, columns) || nonColumnKeyOverride) {
          firstPart += `${key},`;
          if (value === 'now()') {
            secondPart += 'now(),';
          } else {
            secondPart += typeof value === 'string' ? `'${value.replace(/'/g, '\'\'')}',` : `${value},`;
          }
        }
      }

      firstPart = firstPart.slice(0, -1);
      secondPart = secondPart.slice(0, -1) + ');\n';

      if (`${firstPart}${secondPart}` !== '') {
        stylePart = `INSERT INTO ${gridGeneral.getStyleTableName(table)} (${COSMETIC_ID})\nVALUES (${nextGridSpecificId});\n\n`;
      }

      combinedQuery += `${firstPart}${secondPart}${stylePart}`;
    });

    await db.query(combinedQuery);

    return res.status(200).json(security.encrypt({success: true, result: true}));
  } catch (err) {
    return util.errorHandler({err: err, context: 'appendAgGridSpreadsheetRecord', isLast: true});
  }
}

async function addRowWithData(req, res) {
  try {
    req.body.func = 'addRowWithData';
    req.body.db = setDatabase(req.body.db);

    // await db.setReq(req);

    const id = req.body.data[ID];
    const replacementId = req.body.data.replacementId;

    const DATA_TABLE = req.body.data.gridName;
    const STYLE_TABLE = DATA_TABLE + '_style';
    const numOfTables = await gridGeneral.findNumberOfTables(db, DATA_TABLE);
    const nextGridSpecificId = await gridGeneral.getNextGridSpecificId(db, DATA_TABLE);

    // increment primary keys for both data and style table and insert the new row in each table.
    let INSERT_ROW_QUERY = '          BEGIN; \n';

    for (let i = 0; i < numOfTables; i++) {
      if (i === 0) {
        INSERT_ROW_QUERY += `
          LOCK ${DATA_TABLE};
          LOCK ${STYLE_TABLE};
        `;
      } else {
        INSERT_ROW_QUERY += `
          LOCK ${DATA_TABLE}_${(i + 1)};
          LOCK ${STYLE_TABLE}_${(i + 1)};
        `;
      }
    }

    for (let i = 0; i < numOfTables; i++) {
      const currentDataTable = DATA_TABLE + (i === 0 ? '' : '_' + (i + 1));
      const currentStyleTable = STYLE_TABLE + (i === 0 ? '' : '_' + (i + 1));

      // update data
      let keyStatement = '';
      let valueStatement = '';
      for (const [key, value] of Object.entries(req.body.data.data)) {
        keyStatement += `${key}, `;
        valueStatement += `'${value.replace(/\'/, '\'\'')}', `;
      }

      if (req.body.updateCount) {
        keyStatement += 'create_date, ';
        valueStatement += 'now(), ';
      }

      if (req.body.updateCount) {
        keyStatement += 'update_count, ';
        valueStatement += '0, ';
      }

      keyStatement = keyStatement.substring(0, keyStatement.length - 2);
      valueStatement = valueStatement.substring(0, valueStatement.length - 2);

      INSERT_ROW_QUERY += `
          WITH t as (
            INSERT INTO ${currentDataTable} (${COSMETIC_ID}${replacementId ? `, ${ID}` : ''}, ${keyStatement})
            VALUES (${nextGridSpecificId}${replacementId ? `, ${replacementId}` : ''}, ${valueStatement})
            RETURNING ${COSMETIC_ID}, ${ID}
          )
          INSERT INTO ${currentStyleTable} (${COSMETIC_ID}, ${ID})
          SELECT t.${COSMETIC_ID}, t.${ID}
          FROM t;
        `;
    };

    INSERT_ROW_QUERY += await getIncrementExpressionQuery(req, id);

    INSERT_ROW_QUERY += '   COMMIT; ';

    await db.query(INSERT_ROW_QUERY);

    if (req.body.changeLog) {
      try {
        const newState = await gridGeneral.getDataStyleConcatRecord(db, DATA_TABLE, id, numOfTables);
        const insertChangeObj = {
          db: db,
          mainTable: `'${DATA_TABLE}'`,
          func: `'${req.body.func}'`,
          columnAffected: null,
          oldState: null,
          newState: `'${gridGeneral.prepObjForSql(newState)}'`,
          username: `'${req.user.username}'`
        };
        await gridGeneral.insertChange(insertChangeObj);
      } catch (err) {
        console.log(err);
        console.log('insertChange failed.');
      }
    }

    return res.status(200).json(security.encrypt({success: true, result: true}));
  } catch (err) {
    return res.status(200).json(security.encrypt({success: false, result: {msg: DEFAULT_ERROR_MESSAGE + ' Error Code: 27', critical: true, result: util.errorHandler({err: err, context: 'addRowWithData', isLast: true})}}));
  }
}

async function addRowWithPartiallyCopiedData(req, res) {
  try {
    req.body.func = 'addRowWithPartiallyCopiedData';
    req.body.db = setDatabase(req.body.db);

    // await db.setReq(req);

    const id = req.body.data[ID];
    const replacementId = req.body.data.replacementId;

    const DATA_TABLE = req.body.data.gridName;
    const STYLE_TABLE = DATA_TABLE + '_style';
    const numOfTables = await gridGeneral.findNumberOfTables(db, DATA_TABLE);

    // increment primary keys for both data and style table and insert the new row in each table.
    let INSERT_ROW_QUERY = 'BEGIN; \n';

    for (let i = 0; i < numOfTables; i++) {
      if (i === 0) {
        INSERT_ROW_QUERY += `
          LOCK ${DATA_TABLE};
          LOCK ${STYLE_TABLE};
        `;
      } else {
        INSERT_ROW_QUERY += `
          LOCK ${DATA_TABLE}_${(i + 1)};
          LOCK ${STYLE_TABLE}_${(i + 1)};
        `;
      }
    }

    for (let i = 0; i < numOfTables; i++) {
      const currentDataTable = DATA_TABLE + (i === 0 ? '' : '_' + (i + 1));
      const currentStyleTable = STYLE_TABLE + (i === 0 ? '' : '_' + (i + 1));

      // increment data table
      INSERT_ROW_QUERY += `
        ALTER TABLE ${currentDataTable} DROP CONSTRAINT ${currentDataTable}_${COSMETIC_ID}_key;
        WITH t AS (
          SELECT ${COSMETIC_ID}
          FROM ${currentDataTable}
          WHERE ${ID} = ${id}
        )
        UPDATE ${currentDataTable} 
        SET ${COSMETIC_ID} = ${currentDataTable}.${COSMETIC_ID} + 1
        FROM t
        WHERE ${currentDataTable}.${COSMETIC_ID} >= t.${COSMETIC_ID};
        ALTER TABLE ${currentDataTable} ADD UNIQUE (${COSMETIC_ID});
      `;

      // increment style table
      INSERT_ROW_QUERY += `
        ALTER TABLE ${currentStyleTable} DROP CONSTRAINT ${currentStyleTable}_${COSMETIC_ID}_key;
        WITH t AS (
          SELECT ${COSMETIC_ID}
          FROM ${currentStyleTable}
          WHERE ${ID} = ${id}
        )
        UPDATE ${currentStyleTable} 
        SET ${COSMETIC_ID} = ${currentStyleTable}.${COSMETIC_ID} + 1
        FROM t
        WHERE ${currentStyleTable}.${COSMETIC_ID} >= t.${COSMETIC_ID};
        ALTER TABLE ${currentStyleTable} ADD UNIQUE (${COSMETIC_ID});
      `;

      // insert records and update data
      // update data
      let keyStatement = '';
      let valueStatement = '';
      for (const [key, value] of Object.entries(req.body.data.data)) {
        keyStatement += `${key}, `;
        valueStatement += `'${value.replace(/\'/, '\'\'')}', `;
      }

      keyStatement = keyStatement.substring(0, keyStatement.length - 2);
      valueStatement = valueStatement.substring(0, valueStatement.length - 2);

      INSERT_ROW_QUERY += `
        WITH t as (
          INSERT INTO ${currentDataTable} (${COSMETIC_ID}${replacementId ? `, ${ID}` : ''}, ${keyStatement})
          SELECT ${COSMETIC_ID} - 1${replacementId ? `, ${replacementId}` : ''}, ${valueStatement}
          FROM ${currentDataTable}
          WHERE ${ID} = ${id}
          RETURNING ${COSMETIC_ID}, ${ID}
        )
        INSERT INTO ${currentStyleTable} (${COSMETIC_ID}, ${ID})
        SELECT t.${COSMETIC_ID}, t.${ID}
        FROM t;
      `;
    };

    INSERT_ROW_QUERY += await getIncrementExpressionQuery(req, id);

    INSERT_ROW_QUERY += ' COMMIT; ';

    await db.query(INSERT_ROW_QUERY);

    if (req.body.changeLog) {
      try {
        const newState = await gridGeneral.getDataStyleConcatRecord(db, DATA_TABLE, id, numOfTables);
        const insertChangeObj = {
          db: db,
          mainTable: `'${DATA_TABLE}'`,
          func: `'${req.body.func}'`,
          columnAffected: null,
          oldState: null,
          newState: `'${gridGeneral.prepObjForSql(newState)}'`,
          username: `'${req.user.username}'`
        };
        await gridGeneral.insertChange(insertChangeObj);
      } catch (err) {
        console.log(err);
        console.log('insertChange failed.');
      }
    }

    return res.status(200).json(security.encrypt({success: true, result: true}));
  } catch (err) {
    return res.status(200).json(security.encrypt({success: false, result: {msg: DEFAULT_ERROR_MESSAGE + ' Error Code: 28', critical: true, result: util.errorHandler({err: err, context: 'addRowWithPartiallyCopiedData', isLast: true})}}));
  }
}

// Non-endpoint functions
// initial setup
async function createDataTable(dataTable) {
  try {
    const TABLE_CREATION_QUERY = `
      CREATE TABLE ${dataTable}
      (
        ${ID} serial PRIMARY KEY,
        ${COSMETIC_ID} integer NOT NULL UNIQUE
      )
      WITH (
        OIDS = FALSE
      )
      TABLESPACE pg_default;

      ALTER TABLE ${dataTable}
        OWNER to ${postgresqlOwner};
    `;

    await db.query(TABLE_CREATION_QUERY);

    debug.log('Data Table Created');
    return true;
  } catch (err) {
    return util.errorHandler({err: err, context: 'createDataTable', isLast: true});
  }
}

async function createColumnTable(dataTable) {
  try {
    let query = '';

    const COLUMN_TABLE = dataTable + '_columns';

    let TABLE_CREATION_QUERY = `
      CREATE TABLE ${COLUMN_TABLE}
      (
        id integer,
        column_name character varying(100) COLLATE pg_catalog."default" NOT NULL,
        db_only boolean,
        hide boolean,
        width integer,
        editable boolean,
        admin_only boolean,
        has_expression boolean,
        to_upper boolean,
        to_currency boolean,
        to_date boolean,
        row_group boolean,
        agg_func boolean,
        horizontal_formula character varying(200) COLLATE pg_catalog."default",
        pinned character varying(50) COLLATE pg_catalog."default",
        cell_editor character varying(50) COLLATE pg_catalog."default",
        value_formatter character varying(50) COLLATE pg_catalog."default",
        cell_style character varying(50) COLLATE pg_catalog."default",
        custom_header_name character varying(100) COLLATE pg_catalog."default",
        table_name character varying(100) COLLATE pg_catalog."default",
        CONSTRAINT ${COLUMN_TABLE}_pkey PRIMARY KEY (id)
      )
      WITH (
        OIDS = FALSE
      )
      TABLESPACE pg_default;

      ALTER TABLE ${COLUMN_TABLE}
          OWNER to ${postgresqlOwner};
    `;
    let result = await gridGeneral.findNumberOfTables(db, dataTable);

    if (result) {
      TABLE_CREATION_QUERY += `
        INSERT INTO ${COLUMN_TABLE} (id, column_name, table_name)
        SELECT
          id,
          column_name,
          table_name
        FROM (
          SELECT
            id - 1 AS id,
            column_name,
            table_name
          FROM (
            SELECT
              row_number() OVER () AS id,
              column_name,
              table_name
            FROM
              information_schema.columns
            WHERE table_name = '${dataTable}'
          ) AS temp
      `;

      for (let i = 0; i < result - 1; i++) {
        TABLE_CREATION_QUERY += `
          UNION
          SELECT id, column_name, table_name
          FROM (
            SELECT
              ${String(MAX_COLUMNS_PER_TABLE - 2 + ((MAX_COLUMNS_PER_TABLE - 1) * i))} + id AS id,
              column_name,
              table_name
            FROM (
              SELECT
                row_number() over () AS id,
                column_name,
                table_name
              FROM
                information_schema.columns
              WHERE table_name = '${dataTable}_${String(2 + (1 * i))}'
            ) AS temp2
          ) AS temp
          WHERE id > ${String(MAX_COLUMNS_PER_TABLE - 1 + ((MAX_COLUMNS_PER_TABLE - 1) * i))}
        `;
      }

      TABLE_CREATION_QUERY += `
        ) AS temp3
        ORDER BY id;

        UPDATE ${COLUMN_TABLE}
        SET width = 55,
          editable = false,
          cell_editor = null,
          value_formatter = null,
          custom_header_name = '',
          pinned = 'left',
          db_only = true
        WHERE column_name = '${COSMETIC_ID}';

        UPDATE ${COLUMN_TABLE}
        SET width = 55,
          editable = false,
          cell_editor = null,
          value_formatter = null,
          custom_header_name = '',
          pinned = '',
          db_only = true
        WHERE column_name = '${ID}';
      `;

      result = await db.query(TABLE_CREATION_QUERY);

      query = `SELECT column_name FROM ${COLUMN_TABLE} WHERE column_name != '${COSMETIC_ID}'`;
      let results = await db.query(query);

      let TABLE_UPDATE_QUERY = '';

      for (let j = 0; j < results.length; j++) {
        let customHeaderName = results[j].column_name.replace(/_/g, ' ');
        customHeaderName = util.toTitleCase(customHeaderName);

        TABLE_UPDATE_QUERY += `
          UPDATE ${COLUMN_TABLE}
          SET custom_header_name = '${customHeaderName}'
          WHERE column_name = '${results[j].column_name}';
        `;
      }

      results = await db.query(TABLE_UPDATE_QUERY);

      return true;
    } else {
      TABLE_CREATION_QUERY += `
        INSERT INTO ${COLUMN_TABLE} (
          id,
          column_name,
          width,
          editable,
          cell_editor,
          value_formatter,
          custom_header_name,
          pinned,
          db_only
        )
        VALUES (
          0,
          '${COSMETIC_ID}',
          55,
          false,
          null,
          null,
          '',
          'left',
          false
        ),
        (
          1,
          '${ID}',
          55,
          false,
          null,
          null,
          '',
          '',
          true
        )
      `;

      await db.query(TABLE_CREATION_QUERY);

      debug.log('Created column table');
      return true;
    }
  } catch (err) {
    return util.errorHandler({err: err, context: 'createColumnTable', isLast: true});
  }
}

async function createStyleTable(dataTable) {
  try {
    const COLUMN_TABLE = dataTable + '_columns';

    const COLUMN_TABLE_QUERY = `SELECT * FROM ${COLUMN_TABLE} ORDER BY id;`;

    const columnTable = await db.query(COLUMN_TABLE_QUERY);
    if (!columnTable) {
      console.log('No columns in table.');
      return true;
    }

    const distinctTables = gridGeneral.getDistinctTablesFromColumnTable(columnTable);

    let TABLE_CREATION_QUERY = '';

    distinctTables.forEach((table) => {
      TABLE_CREATION_QUERY += `
        CREATE TABLE ${gridGeneral.getStyleTableName(table)}
        (
          ${ID} integer NOT NULL REFERENCES ${table}(${ID}) ON DELETE CASCADE,
          ${COSMETIC_ID} integer NOT NULL UNIQUE,
      `;

      columnTable.forEach((column) => {
        if (column.table_name === table) {
          if (column.column_name !== COSMETIC_ID && column.column_name !== ID) {
            const columnName = 'styleattrib_' + column.column_name;

            TABLE_CREATION_QUERY += `${columnName} character varying(${MAX_CHARACTERS_PER_STYLE}) COLLATE pg_catalog."default" DEFAULT ''::character varying, `;
          }
        }
      });
      TABLE_CREATION_QUERY = TABLE_CREATION_QUERY.substring(0, TABLE_CREATION_QUERY.length - 2);
      TABLE_CREATION_QUERY = TABLE_CREATION_QUERY.replace(/,[\s]*$/, '');

      TABLE_CREATION_QUERY += `
        )
        WITH (
          OIDS = FALSE
        )
        TABLESPACE pg_default;
  
        ALTER TABLE ${gridGeneral.getStyleTableName(table)}
          OWNER to ${postgresqlOwner};
  
        INSERT INTO ${gridGeneral.getStyleTableName(table)} SELECT ${ID}, ${COSMETIC_ID} FROM ${table};
      `;
    });

    console.log(TABLE_CREATION_QUERY);
    await db.query(TABLE_CREATION_QUERY);

    debug.log('Style Table Created');
    return true;
  } catch (err) {
    return util.errorHandler({err: err, context: 'createStyleTable', isLast: true});
  }
}

// helper functions
// type is either data, style, or both depending on which data you want returned.
async function tableAggregator(tableAggObj) {
  const findNumberOfColumns = (table) => {
    return Object.keys(table[0]).length;
  };

  const generateSelectQueriesFromTableName = async () => {
    const getArrOfTableNames = () => {
      const tableNames = [];

      tableNames.push(tableAggObj.tableName);

      let newTableName = tableAggObj.tableName;

      do {
        let num;

        const pos = newTableName.search(/_\d+/);
        if (pos !== -1) {
          num = newTableName.slice(pos + 1, newTableName.length);

          if (parseInt(num) - 1 > 1) {
            num = newTableName.replace(/_\d+/, '_' + String(parseInt(num) - 1));
          } else {
            num = newTableName.replace(/_\d+/, '');
          }
        } else {
          num = null;
        }

        newTableName = num;
        if (newTableName !== null) {
          tableNames.push(newTableName);
        }
      } while (newTableName !== null);

      return tableNames;
    };

    const getColumnSchemaQuery = (tableNames) => {
      let COLUMN_SCHEMA_QUERY = `
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE
      `;

      for (let i = 0; i < tableNames.length; i++) {
        COLUMN_SCHEMA_QUERY += `table_name = '${tableNames[i]}'`;

        if (i !== tableNames.length - 1) {
          COLUMN_SCHEMA_QUERY += ' OR ';
        }
      }

      COLUMN_SCHEMA_QUERY += ';';

      return COLUMN_SCHEMA_QUERY;
    };

    const getNewTableNames = (tableNames, i) => {
      let dataTableName;
      let styleTableName;

      if (!/style/.test(tableNames[i])) {
        dataTableName = tableNames[i];
        styleTableName = tableNames[i];

        const pos = styleTableName.search(/_\d+/);
        if (pos !== -1) {
          const num = styleTableName.slice(pos + 1, styleTableName.length);

          styleTableName = styleTableName.slice(0, pos) + '_style_' + num;
        } else {
          styleTableName += '_style';
        }
      } else {
        dataTableName = tableNames[i];
        styleTableName = tableNames[i];

        let pos = dataTableName.search(/_\d+/);
        if (pos !== -1) {
          const num = dataTableName.slice(pos + 1, dataTableName.length);

          pos = 0;
          pos = dataTableName.search(/style_\d+/);
          if (pos !== -1) {
            dataTableName = dataTableName.slice(0, pos) + num;
          }
        } else {
          pos = 0;
          pos = dataTableName.search(/style_\d+/);
          if (pos !== -1) {
            dataTableName = dataTableName.slice(0, pos);
          }
        }
      }

      return [dataTableName, styleTableName];
    };

    const getOrderByString = (j) => {
      const thisSortModel = tableAggObj.sortModel[j];
      const sort = thisSortModel.sort;
      const colId = thisSortModel.colId;

      let SELECT_QUERY = '';

      SELECT_QUERY += `                COALESCE(to_date(SUBSTRING(TRIM(${colId}) FROM '\\d{1,2}/\\d{1,2}/\\d{2,4}'), 'MM/DD/YYYY'), to_date('12/30/99', 'MM/DD/YYY'))`;
      SELECT_QUERY += sort === 'desc' ? ' DESC, \n' : ', \n';

      SELECT_QUERY += `                SUBSTRING(TRIM(${colId}) FROM '^-')`;
      SELECT_QUERY += sort === 'desc' ? ' DESC, \n' : ', \n';

      SELECT_QUERY += `                COALESCE(SUBSTRING(TRIM(${colId}) FROM '^(\\d+)')::INTEGER, 99999999)`;
      SELECT_QUERY += sort === 'desc' ? ' DESC, \n' : ', \n';

      SELECT_QUERY += `                SUBSTRING(TRIM(${colId}) FROM '^\\d* *(.*?)( \\d+)?$')`;
      SELECT_QUERY += sort === 'desc' ? ' DESC, \n' : ', \n';

      SELECT_QUERY += `                COALESCE(SUBSTRING(TRIM(${colId}) FROM ' (\\d+)$')::INTEGER, 0)`;
      SELECT_QUERY += sort === 'desc' ? ' DESC, \n' : ', \n';

      SELECT_QUERY += `                TRIM(${colId})`;
      SELECT_QUERY += sort === 'desc' ? ' DESC \n' : ' \n';

      return SELECT_QUERY;
    };

    try {
      const tableNames = getArrOfTableNames();

      let SELECT_QUERY;
      let LAST_ROW_QUERY;

      SELECT_QUERY = `
        SELECT *
        FROM (
          SELECT *, row_number() over () as row_number
          FROM (
            SELECT *
            FROM
              ${tableNames[tableNames.length - 1]}
            INNER JOIN
              ${tableNames[tableNames.length - 1]}_style USING (${COSMETIC_ID}, ${ID})
      `;

      LAST_ROW_QUERY = `
        SELECT
        FROM
          ${tableNames[tableNames.length - 1]}
        INNER JOIN
          ${tableNames[tableNames.length - 1]}_style USING (${COSMETIC_ID}, ${ID})
      `;

      if (tableAggObj.filterPattern !== '') {
        const COLUMN_SCHEMA_QUERY = getColumnSchemaQuery(tableNames);
        const columns = await db.query(COLUMN_SCHEMA_QUERY);
        if (!columns) throw 'No columns in data table';

        const appendFilterPart = () => {
          SELECT_QUERY += '       WHERE \n';
          LAST_ROW_QUERY += '       WHERE \n';

          const filter = tableAggObj.filter;
          const filterPattern = tableAggObj.filterPattern;

          if (filter) {
            if (filter.length !== undefined) {
              for (let i = 0; i < filter.length; i++) {
                SELECT_QUERY += `               ${filter[i].clause} AND \n`;
                LAST_ROW_QUERY += `               ${filter[i].clause} AND \n`;
              }
            } else {
              SELECT_QUERY += `               (${filter.clause}) AND \n`;
              LAST_ROW_QUERY += `               (${filter.clause}) AND \n`;
            }
          }

          SELECT_QUERY += '                 (\n';
          LAST_ROW_QUERY += '                 (\n';

          for (let i = 0; i < columns.length; i++) {
            const columnName = columns[i].column_name;

            if (columnName !== COSMETIC_ID && columnName !== ID && columns[i].data_type === 'character varying') {
              SELECT_QUERY += `                 ${columnName} ILIKE '%${filterPattern}%' `;
              LAST_ROW_QUERY += `                 ${columnName} ILIKE '%${filterPattern}%' `;

              if (i !== columns.length - 1) {
                SELECT_QUERY += 'OR \n';
                LAST_ROW_QUERY += 'OR \n';
              }
            }
          }

          // This is needed when COSMETIC_ID or ID is at the end of the column table.
          // It generally shouldn't be, but just in case.
          if (/OR \n$/.test(SELECT_QUERY)) {
            SELECT_QUERY = SELECT_QUERY.substring(0, SELECT_QUERY.length - 4);
            LAST_ROW_QUERY = LAST_ROW_QUERY.substring(0, LAST_ROW_QUERY.length - 4);
          }

          SELECT_QUERY += '\n               )';
          LAST_ROW_QUERY += '\n               )';

          return [SELECT_QUERY, LAST_ROW_QUERY];
        };

        const appendOrderPart = () => {
          const sortModel = tableAggObj.sortModel;

          if (sortModel !== undefined && sortModel.length > 0) {
            SELECT_QUERY += '\n                 ORDER BY \n';

            for (let j = 0; j < sortModel.length; j++) {
              SELECT_QUERY += getOrderByString(j);

              if (j < sortModel.length - 1) {
                SELECT_QUERY = SELECT_QUERY.slice(0, -2) + ',\n';
              } else if (j === sortModel.length - 1) {
                SELECT_QUERY = SELECT_QUERY.slice(0, -2);
              }
            }
          } else {
            SELECT_QUERY += `\n                 ORDER BY ${COSMETIC_ID} \n`;
          }

          return [SELECT_QUERY, LAST_ROW_QUERY];
        };

        if (tableNames.length >= 2) {
          for (let i = tableNames.length - 2; i >= 0; i--) {
            const [dataTableName, styleTableName] = getNewTableNames(tableNames, i);

            SELECT_QUERY += `
            INNER JOIN
              ${dataTableName} USING (${COSMETIC_ID}, ${ID})
            INNER JOIN
              ${styleTableName} USING (${COSMETIC_ID}, ${ID})
            `;

            LAST_ROW_QUERY += `
              INNER JOIN
                ${dataTableName} USING (${COSMETIC_ID}, ${ID})
              INNER JOIN
                ${styleTableName} USING (${COSMETIC_ID}, ${ID})
            `;
          }

          [SELECT_QUERY, LAST_ROW_QUERY] = appendFilterPart();

          for (let i = tableNames.length - 2; i >= 0; i--) {
            if (i === 0) {
              [SELECT_QUERY, LAST_ROW_QUERY] = appendOrderPart();
            }
          }
        } else {
          [SELECT_QUERY, LAST_ROW_QUERY] = appendFilterPart();
          [SELECT_QUERY, LAST_ROW_QUERY] = appendOrderPart();
        }

        SELECT_QUERY += `
            ) as inner_temp
          ) as temp
          WHERE temp.row_number > ${tableAggObj.startRow} AND temp.row_number <= ${tableAggObj.endRow};
        `;

        return [SELECT_QUERY, LAST_ROW_QUERY];
      } else {
        const appendLastTablePart = () => {
          const filter = tableAggObj.filter;
          const sortModel = tableAggObj.sortModel;

          if (filter) {
            SELECT_QUERY += '                     WHERE \n';
            LAST_ROW_QUERY += '                     WHERE \n';

            if (filter.length !== undefined) {
              for (let i = 0; i < filter.length; i++) {
                SELECT_QUERY += `                       ${filter[i].clause}`;
                LAST_ROW_QUERY += `                       ${filter[i].clause}`;

                if (i < filter.length - 1) {
                  SELECT_QUERY += ' AND \n';
                  LAST_ROW_QUERY += ' AND \n';
                }
              }
            } else {
              SELECT_QUERY += `                       (${filter.clause}) \n`;
              LAST_ROW_QUERY += `                       (${filter.clause}) \n`;
            }
          }

          if (sortModel !== undefined && sortModel.length > 0) {
            SELECT_QUERY += '\n            ORDER BY \n';

            for (let j = 0; j < sortModel.length; j++) {
              SELECT_QUERY += getOrderByString(j);

              if (j < sortModel.length - 1) {
                SELECT_QUERY = SELECT_QUERY.slice(0, -2) + ',\n';
              } else if (j === sortModel.length - 1) {
                SELECT_QUERY = SELECT_QUERY.slice(0, -2);
              }
            }
          } else {
            SELECT_QUERY += `\n            ORDER BY ${COSMETIC_ID} \n`;
          }

          return [SELECT_QUERY, LAST_ROW_QUERY];
        };

        if (tableNames.length >= 2) {
          for (let i = tableNames.length - 2; i >= 0; i--) {
            const [dataTableName, styleTableName] = getNewTableNames(tableNames, i);

            SELECT_QUERY += `
            INNER JOIN
              ${dataTableName} USING (${COSMETIC_ID}, ${ID})
            INNER JOIN
              ${styleTableName} USING (${COSMETIC_ID}, ${ID})
            `;

            LAST_ROW_QUERY += `
              INNER JOIN
                ${dataTableName} USING (${COSMETIC_ID}, ${ID})
              INNER JOIN
                ${styleTableName} USING (${COSMETIC_ID}, ${ID})
            `;

            if (i === 0) {
              [SELECT_QUERY, LAST_ROW_QUERY] = appendLastTablePart();
            }
          }
        } else {
          [SELECT_QUERY, LAST_ROW_QUERY] = appendLastTablePart();
        }

        SELECT_QUERY += `
          ) as inner_temp
        ) as temp
        WHERE temp.row_number > ${tableAggObj.startRow} AND temp.row_number <= ${tableAggObj.endRow};
        `;

        return [SELECT_QUERY, LAST_ROW_QUERY];
      }
    } catch (err) {
      return util.errorHandler({err: err, context: 'generateSelectQueriesFromTableName'});
    }
  };

  const createNewTables = async () => {
    const generateBrokenUpTables = async (tableName, maxCharacters) => {
      const incrementTableName = (tableName) => {
        const pos = tableName.search(/_\d+/);
        if (pos !== -1) {
          let num = tableName.slice(pos + 1, tableName.length);
          num = String(parseInt(num) + 1);
          tableName = tableName.replace(/_\d+/, '_' + num);
        } else {
          tableName += '_2';
        }

        return tableName;
      };

      const decrementTableName = (tableName) => {
        const pos = tableName.search(/_\d+/);
        if (pos !== -1) {
          let num = tableName.slice(pos + 1, tableName.length);
          if (num !== '2') {
            num = String(parseInt(num) - 1);
            tableName = tableName.replace(/_\d+/, '_' + num);
          } else {
            tableName = tableName.replace(/_\d+/, '');
          }
        } else {
          console.log(`Shouldn't be able to get here`);
        }

        return tableName;
      };

      const generateTableCreationQuery = async (tableName, results, maxCharacters) => {
        try {
          debug.log('generateTableCreationQuery');

          debug.log('Create Data Table');
          let query = 'CREATE TABLE ' + tableName + ' \n' +
            '(\n' +
            `${ID} serial PRIMARY KEY, \n` +
            `${COSMETIC_ID} integer NOT NULL UNIQUE, \n`;

          for (let i = MAX_COLUMNS_PER_TABLE, keys = Object.keys(results[0]); i < keys.length; i++) {
            const key = keys[i];

            query += `${key} character varying(${maxCharacters}) COLLATE pg_catalog."default" DEFAULT ''::character varying, \n`;
          }

          query += `
            )
            WITH (
              OIDS = FALSE
            )
            TABLESPACE pg_default;

            ALTER TABLE ${tableName}
              OWNER to ${postgresqlOwner};
          `;

          await db.query(query);

          debug.log('Insert Queries');

          let insertQueryStarter = `INSERT INTO ${tableName} (${COSMETIC_ID}, ${ID}`;

          for (let j = MAX_COLUMNS_PER_TABLE, keys = Object.keys(results[0]); j < keys.length; j++) {
            const key = keys[j];

            insertQueryStarter += key;

            if (j !== keys.length - 1) {
              insertQueryStarter += ', ';
            }
          }

          insertQueryStarter += ') \nVALUES ';
          query = insertQueryStarter;

          let batchCounter = 0;

          for (let i = 0; i < results.length; i++) {
            query += `\n\t(${results[i][COSMETIC_ID]}, ${results[i][ID]}`;

            for (let j = MAX_COLUMNS_PER_TABLE, keys = Object.keys(results[i]); j < keys.length; j++) {
              const key = keys[j];

              if (results[i][key] !== null) {
                query += `'` + results[i][key].replace(/'/, `''`) + `'`;
              } else {
                query += results[i][key];
              }

              if (j !== keys.length - 1) {
                query += ', ';
              }
            }

            if (i % 5 === 0 && i !== 0) {
              query += '); ';
              console.log('batch insert query');
              console.log(query);
              await db.query(query);
              console.log('Batch ' + batchCounter + ' completed.');
              batchCounter++;
              query = insertQueryStarter;
            } else {
              query += '), ';
            }
          }

          query = query.substring(0, query.length - 3);
          query += '); ';
          await db.query(query);

          debug.log('FINAL QUERY');
          console.log(query);

          debug.log('Update Queries');

          query = '';
          for (let j = MAX_COLUMNS_PER_TABLE, keys = Object.keys(results[0]); j < keys.length; j++) {
            const key = keys[j];

            query += `UPDATE ${columnTableName} SET table_name = '${tableName}' WHERE column_name = '${key}';`;
          }

          console.log('update queries');
          console.log(query);
          await db.query(query);

          return true;
        } catch (err) {
          return util.errorHandler({err: err, context: 'generateTableCreationQuery'});
        }
      };

      try {
        if (!await checkTableExists(tableName)) throw tableName + ' not found.';

        const query = `SELECT * FROM ${tableName} ORDER BY ${COSMETIC_ID};`;
        let results = await db.query(query);

        const numberOfColumns = findNumberOfColumns(results);
        if (numberOfColumns <= MAX_COLUMNS_PER_TABLE) {
          console.log('numberOfColumns <= MAX_COLUMNS_PER_TABLE');
          return true;
        }
        debug.log('numberOfColumns > MAX_COLUMNS_PER_TABLE');

        tableName = incrementTableName(tableName);

        await generateTableCreationQuery(tableName, results, maxCharacters);

        let columnDeletionQuery = '';
        const columnDeletionTableName = decrementTableName(tableName);

        for (let i = MAX_COLUMNS_PER_TABLE, keys = Object.keys(results[0]); i < keys.length; i++) {
          const key = keys[i];

          columnDeletionQuery += `ALTER TABLE ${columnDeletionTableName} DROP COLUMN ${key}; `;
        }

        results = await db.query(columnDeletionQuery);

        const result = await generateBrokenUpTables(tableName, maxCharacters);
        return result;
      } catch (err) {
        return util.errorHandler({err: err, context: 'generateBrokenUpTables'});
      }
    };

    try {
      debug.log('create new table');

      let result = await generateBrokenUpTables(tableAggObj.tableName, MAX_CHARACTERS_PER_DATA);
      if (!result) throw 'generateBrokenUpTables for data errored out';
      debug.log('data tables broken up');

      result = await generateBrokenUpTables(tableAggObj.tableName + '_style', MAX_CHARACTERS_PER_STYLE);
      if (!result) throw 'generateBrokenUpTables for style errored out';
      debug.log('style tables broken up');

      result = await tableAggregator(tableAggObj);

      if (result) {
        debug.log('completed aggregation');
        return result;
      } else {
        throw 'Something went wrong in tableAggregator';
      }
    } catch (err) {
      util.errorHandler(err, 'createNewTables');
    }
  };

  try {
    const tableName = tableAggObj.tableName;
    const suppressTableSplit = tableAggObj.suppressTableSplit;

    if (!await checkTableExists(tableName)) throw `No table named: ${tableName}`;

    const query = `SELECT * FROM ${tableName} LIMIT 1;`;
    const results = await db.query(query);
    if (!results) throw 'No data in table';

    if (results.length === 0) { // Why is this being done instead of throwing an error?
      const [select, lastRow] = await generateSelectQueriesFromTableName();
      return [select, lastRow];
    }

    const numberOfColumns = findNumberOfColumns(results);

    if (!suppressTableSplit && numberOfColumns > MAX_COLUMNS_PER_TABLE) {
      debug.log('numberOfColumns > MAX_COLUMNS_PER_TABLE');

      return await createNewTables();
    } else if (!suppressTableSplit && numberOfColumns === MAX_COLUMNS_PER_TABLE) {
      const matchTableNumber = tableName.match(/_(\d+)/);
      if (matchTableNumber) {
        let num = matchTableNumber[1];
        num = String(parseInt(num) + 1);

        const newTableAggObj = JSON.parse(JSON.stringify(tableAggObj));
        newTableAggObj.tableName = tableName.replace(/_\d+/, '_' + num);

        const result = await tableAggregator(newTableAggObj);
        if (result) return result;

        const [select, lastRow] = await generateSelectQueriesFromTableName();
        return [select, lastRow];
      } else {
        const newTableAggObj = JSON.parse(JSON.stringify(tableAggObj));
        newTableAggObj.tableName = `${tableName}_2`;

        const result = await tableAggregator(newTableAggObj);
        if (result) return result;

        const [select, lastRow] = await generateSelectQueriesFromTableName();
        return [select, lastRow];
      }
    } else {
      // number of columns is below threshold
      const matchTableNumber = tableName.match(/_(\d+)/);
      if (matchTableNumber) {
        let num = matchTableNumber[1];
        num = String(parseInt(num) + 1);
        const nextTableName = tableName.replace(/_\d+/, `_` + num);

        if (await checkTableExists(nextTableName)) {
          const newTableAggObj = JSON.parse(JSON.stringify(tableAggObj));
          newTableAggObj.tableName = nextTableName;

          const result = await tableAggregator(newTableAggObj);
          if (result) return result;

          const [select, lastRow] = await generateSelectQueriesFromTableName();
          return [select, lastRow];
        } else {
          const [select, lastRow] = await generateSelectQueriesFromTableName();
          return [select, lastRow];
        }
      } else {
        if (await checkTableExists(`${tableName}_2`)) {
          const newTableAggObj = JSON.parse(JSON.stringify(tableAggObj));
          newTableAggObj.tableName = `${tableName}_2`;

          const result = await tableAggregator(newTableAggObj);
          if (result) return result;

          const [select, lastRow] = await generateSelectQueriesFromTableName();
          return [select, lastRow];
        } else {
          const [select, lastRow] = await generateSelectQueriesFromTableName();
          return [select, lastRow];
        }
      }
    }
  } catch (err) {
    util.errorHandler({err: err, context: 'tableAggregator', isLast: true});
    return false;
  }
}

function setDatabase(db) {
  if (db) {
    if (db === 'ca') {
      postgresqlOwner = 'careadvo';
    } else {
      postgresqlOwner = db;
    }
  } else {
    db = 'mdx';
    postgresqlOwner = 'mdx';
  }

  return db;
}

async function checkTableExists(tableName) {
  const query = `SELECT to_regclass('${tableName}');`;

  const results = await db.query(query);
  console.log(results[0].to_regclass !== null);
  return results[0].to_regclass !== null;
}

module.exports = {
  getRows: getRows,
  getRawRows: getRawRows,
  verifyDataTable: verifyDataTable,
  verifyStyleTable: verifyStyleTable,
  verifyColumnTable: verifyColumnTable,
  getColumns: getColumns,
  getDataTablesSchema: getDataTablesSchema,
  updateData: updateData,
  updateStyle: updateStyle,
  addRow: addRow,
  removeRow: removeRow,
  addColumn: addColumn,
  removeColumn: removeColumn,
  renameColumn: renameColumn,
  setCustomHeaderName: setCustomHeaderName,
  hideColumn: hideColumn,
  pinColumn: pinColumn,
  forceProperty: forceProperty,
  setColumnWidth: setColumnWidth,
  setHorizontalFormula: setHorizontalFormula,
  copyFormulaDownColumn: copyFormulaDownColumn,
  setColumnData: setColumnData,
  appendAgGridSpreadsheetRecord: appendAgGridSpreadsheetRecord,
  addRowWithData: addRowWithData,
  addRowWithPartiallyCopiedData: addRowWithPartiallyCopiedData
};