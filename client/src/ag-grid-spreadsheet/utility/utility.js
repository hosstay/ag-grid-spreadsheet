function getRowData(gridOptions) {
  const rowData = [];
  gridOptions.api.forEachNode((node) => {
    rowData.push(node.data);
  });

  return rowData;
}

function getRowDataAfterFilterAndSort(gridOptions) {
  const rowData = [];
  gridOptions.api.forEachNodeAfterFilterAndSort((node) => {
    rowData.push(node.data);
  });

  return rowData;
}

function getRowDataAfterFilterAndSortAndRemoveUndefined(gridOptions) {
  let rowData = getRowDataAfterFilterAndSort(gridOptions);

  rowData = rowData.filter((row) => {
    return row;
  });

  return rowData;
}

function getRowNodeFromTextNode(context, text) {
  let rowNode;
  context.gridOptions.api.forEachNode((node) => {
    if (node.data.agGridTextNodeId === text) {
      rowNode = node;
    }
  });

  return rowNode;
}

function copyStringToClipboard(str) {
  const el = document.createElement('textarea');
  el.value = str;

  // make temp element non-editable to avoid focus by the user
  el.setAttribute('readonly', '');
  el.style = {position: 'absolute', left: '-9999px'};

  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);

  return;
}

function isSingleCellSelection(rangeSelections) {
  if (rangeSelections.length === 1) {
    if (rangeSelections[0].startRow.rowIndex === rangeSelections[0].endRow.rowIndex) {
      if (rangeSelections[0].columns.length === 1) {
        return true;
      }
    }
  }

  return false;
}

function changeFormulaBar(context, newValue, append = false) {
  if (document.getElementById(context.formulaBar) !== null) {
    if (append) {
      document.getElementById(context.formulaBar).innerHTML += newValue;
      document.getElementById(context.formulaBar).value += newValue;
    } else {
      document.getElementById(context.formulaBar).innerHTML = newValue;
      document.getElementById(context.formulaBar).value = newValue;
    }
  }

  return true;
}

async function moveSelection(context, nextRowIndex, nextCol) {
  const gridApi = context.gridOptions.api;
  const columns = context.gridOptions.columnApi.getAllGridColumns();
  const nextRow = gridApi.getDisplayedRowAtIndex(nextRowIndex);

  const visibleColumn = columns.some((col) => nextCol === col.colId && col.pinned === null);
  if (visibleColumn) {
    gridApi.ensureColumnVisible(nextCol);
    // await timeoutPromise(10);
  }

  gridApi.ensureIndexVisible(nextRow.rowIndex);

  gridApi.clearRangeSelection();
  gridApi.addCellRange({
    rowStartIndex: nextRow.rowIndex,
    rowEndIndex: nextRow.rowIndex,
    columnStart: nextCol,
    columnEnd: nextCol
  });

  gridApi.setFocusedCell(nextRow.rowIndex, nextCol);

  const cellFocus = document.querySelector('.ag-cell-focus');
  if (cellFocus) cellFocus.focus();

  if (document.activeElement.id !== 'formula-bar') {
    if (nextRow.data[nextCol] !== undefined) {
      changeFormulaBar(context, nextRow.data[nextCol]);
    } else {
      changeFormulaBar(context, '');
    }
  }

  return;
};

// database handlers
async function getDBRowData(context) {
  try {
    const finalRequest = [];
    finalRequest.push({
      request: {
        endRow: context.lastRow,
        startRow: 0
      },
      filterPattern: '',
      gridName: context.getGridName(),
      altColumnTable: context.params.options.altColumnTable
    });

    const response = await context.sendRequest('api/ag-grid-spreadsheet/', 'getRows', finalRequest);

    debugLog('Data Table Returned');
    return response.rows;
  } catch (err) {
    return errorHandler({err: err, context: 'getDBRowData'});
  }
}

async function verifyDataTable(context) {
  try {
    const request = [];
    request.push({
      gridName: context.getGridName()
    });

    await context.sendRequest('api/ag-grid-spreadsheet/', 'verifyDataTable', request);

    debugLog('Data Table Verified');
    return true;
  } catch (err) {
    return errorHandler({err: err, context: 'verifyDataTable'});
  }
}

async function getDBColumnTable(context) {
  try {
    const request = {
      gridName: context.getGridName(),
      altColumnTable: context.params.options.altColumnTable
    };

    const response = await context.sendRequest('api/ag-grid-spreadsheet/', 'getColumns', request);

    debugLog('Column Table Returned');
    return response;
  } catch (err) {
    return errorHandler({err: err, context: 'getDBColumnTable'});
  }
}

async function verifyColumnTable(context) {
  try {
    const request = {
      gridName: context.getGridName(),
      altColumnTable: context.params.options.altColumnTable
    };

    await context.sendRequest('api/ag-grid-spreadsheet/', 'verifyColumnTable', request);

    debugLog('Column Table Verified');
    return true;
  } catch (err) {
    return errorHandler({err: err, context: 'verifyColumnTable'});
  }
}

async function verifyStyleTable(context) {
  try {
    const request = [];
    request.push({
      gridName: context.getGridName()
    });

    await context.sendRequest('api/ag-grid-spreadsheet/', 'verifyStyleTable', request);

    debugLog('Style Table Verified');
    return true;
  } catch (err) {
    return errorHandler({err: err, context: 'verifyStyleTable'});
  }
}

async function getDataTablesSchema(context) {
  try {
    const request = {
      gridName: context.getGridName()
    };

    const response = await context.sendRequest('api/ag-grid-spreadsheet/', 'getDataTablesSchema', request);

    debugLog('Data tables schema retrieved.');
    return response;
  } catch (err) {
    return errorHandler({err: err, context: 'getDataTablesSchema'});
  }
}

// parsing style and data strings

function extractStyles(cellStyle) {
  const styles = [];
  let pos = -1;

  if (cellStyle !== null) {
    pos = cellStyle.search(/\$/);
    if (pos !== -1) {
      // get everyting after $ and recursively call this function to find more $'s
      const str = cellStyle.slice(pos + 1, cellStyle.length);
      const resultArray = extractStyles(str);

      // push each item from resultarray onto my recursive array.
      for (let i = 0; i < resultArray.length; i++) {
        styles.push(resultArray[i]);
      }

      // for this iteration, get the string from the beginning of the string
      // to the next symbol.
      pos = -1;
      pos = str.search(/([#$]|$)/);
      if (pos !== -1) {
        styles.push(str.slice(0, pos));
      }
    }
  }

  return styles;
}

function resolveFormattingExpressions(newValue, params) {
  const styleColumn = 'styleattrib_' + params.column.colId;
  const rowNode = params.data;
  let cellStyle;

  // TODO: find a less-hacky way to allow updating column headings after editing the column name
  if (params.value === undefined && rowNode) {
    cellStyle = rowNode[styleColumn];
    // cellStyle = gridOptions.rowData[params.data.id - 1][styleColumn];
  } else {
    cellStyle = params.data[styleColumn];
  }

  if (cellStyle !== undefined) {
    const styles = extractStyles(cellStyle);

    // if there is a value and it is a number
    // TODO: third check might be redundant
    if (newValue !== null && !isNaN(newValue) && /[\d.]+/.test(newValue)) {
      for (let i = 0; i < styles.length; i++) {
        let format = styles[i];
        let formatParam;

        // find format and format params within style. Broken up by |
        const pos = styles[i].search(/\|/);
        if (pos !== -1) {
          format = styles[i].slice(0, pos);
          formatParam = styles[i].slice(pos + 1, styles[i].length);
        }

        /* list of expected format stylings. */
        if (format === 'fl') {
          newValue = parseFloat(newValue).toFixed(parseInt(formatParam));
        }
      }
    }
  }

  return newValue;
}

function resolveExpressionStatements(expression, context, rowData, columnDefs, recursionCounter = 0) {
  const getColumnRange = (firstColumn, secondColumn) => {
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
      return errorHandler({err: err, context: 'getColumnRange'});
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
      return errorHandler({err: err, context: 'getColIdPair'});
    }
  };

  const getValueOfColIdPair = (col, id, rowData) => {
    try {
      let value = 0.00;
      const index = rowData.findIndex((row) => row && row[context.COSMETIC_ID] === parseInt(String(id)));

      if (index !== -1) {
        if (rowData[index][col] !== null && rowData[index][col] !== undefined && col !== context.COSMETIC_ID && col !== context.ID ) {
          const isExpression = /^=/.test(rowData[index][col]);

          if (isExpression) {
            let result = resolveExpressionStatements(rowData[index][col], context, rowData, columnDefs, recursionCounter += 1);
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
            if (rowData[index][col] === '') {
              value = 0.00;
            } else if (rowData[index][col] === 'ERROR') {
              throw 'Cell this expression references is an errored cell.';
            } else {
              const hasDigit = /\d/.test(rowData[index][col]);

              if (hasDigit) {
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
          } else if (col === context.COSMETIC_ID || col === context.ID) {
            value = rowData[index][col];
          } else {
            throw `The cell this expression references is undefined (Doesn't exist)`;
          }

          return value;
        }
      } else {
        throw `Couldn't find this id.`;
      }
    } catch (err) {
      return errorHandler({err: err, context: 'getValueOfColIdPair'});
    }
  };

  const sumAllRanges = (expression, pos, rowData) => {
    try {
      const thisRange = expression.slice(0, pos);
      const restOfExpression = expression.slice(pos + 1, expression.length);
      let newValue = 0;

      const posOfRangeSplitForRange = thisRange.search(/:/);
      const hasRangeSplitForRange = posOfRangeSplitForRange !== -1;

      if (!hasRangeSplitForRange) throw `Must be ':' in sumAllRanges exp range`;

      newValue = sumRange(thisRange, posOfRangeSplitForRange, rowData);

      const posOfAdditionalRangeSplit = restOfExpression.search(/,/);
      const hasAdditionalRangeSplit = posOfAdditionalRangeSplit !== -1;

      if (hasAdditionalRangeSplit) {
        const result = sumAllRanges(restOfExpression, posOfAdditionalRangeSplit, rowData);
        newValue = parseFloat((newValue + result).toPrecision(12));

        return newValue;
      } else {
        const posOfRangeSplitForRest = restOfExpression.search(/:/);
        const hasRangeSplitForRest = posOfRangeSplitForRest !== -1;
        if (!hasRangeSplitForRest) throw `Must be ':' in sumAllRanges exp rest`;

        const result = sumRange(restOfExpression, posOfRangeSplitForRest, rowData);
        newValue = parseFloat((newValue + result).toPrecision(12));

        return newValue;
      }
    } catch (err) {
      return errorHandler({err: err, context: 'sumAllRanges'});
    }
  };

  const sumRange = (newValue, pos, rowData) => {
    const getArrayOfValues = (rowMin, rowMax, columns, rowData) => {
      const arrayOfExpressionsIterator = (arrayOfExpressions, rowData) => {
        try {
          const arrayOfExpressionValues = [];

          for (let i = 0; i < arrayOfExpressions.length; i++) {
            const value = getValueOfColIdPair(arrayOfExpressions[i].key, arrayOfExpressions[i][context.COSMETIC_ID], rowData);
            arrayOfExpressionValues.push(value);
          }

          return arrayOfExpressionValues;
        } catch (err) {
          return errorHandler({err: err, context: 'arrayOfExpressionsIterator'});
        }
      };

      const getMinAndMaxRowIndexes = (rowData) => {
        let minIndex = -1;
        let maxIndex = -1;

        for (let i = 0; i < rowData.length; i++) {
          if (rowData[i][context.COSMETIC_ID] === rowMin) {
            minIndex = i;
          }

          if (rowData[i][context.COSMETIC_ID] === rowMax) {
            maxIndex = i;
          }

          if (minIndex !== -1 && maxIndex !== -1) {
            break;
          }
        }

        return [minIndex, maxIndex];
      };

      const getRelevantRows = (rowData, minIndex, maxIndex) => {
        const result = [];

        if (minIndex !== -1 && maxIndex !== -1) {
          for (let i = minIndex; i <= maxIndex; i++) {
            result.push(rowData[i]);
          }
        } else {
          throw 'Rows outside of rowData';
        }

        return result;
      };

      try {
        const [minIndex, maxIndex] = getMinAndMaxRowIndexes(rowData);

        let result = getRelevantRows(rowData, minIndex, maxIndex);

        let arrayOfValues = [];
        const arrayOfExpressions = [];

        for (let i = 0; i < result.length; i++) {
          for (let j = 0, keys = Object.keys(result[i]); j < keys.length; j++) {
            const key = keys[j];

            if (key !== context.COSMETIC_ID && key !== context.ID) {
              let keyInColumns = false;
              for (let i = 0; i < columns.length; i++) {
                if (key === columns[i]) {
                  keyInColumns = true;
                  break;
                }
              }

              if (keyInColumns) {
                if (result[i][key] !== null && result[i][key].length > 0) {
                  if (/^=/.test(result[i][key])) {
                    if (/^[-\d.,]+$/.test(result[i][key])) {
                      let value = result[i][key].replace(/,/g, '');

                      let invert = false;
                      if (/(\(|\))/.test(value)) {
                        value = value.replace(/(\(|\))/g, '');
                        invert = true;
                      }

                      if (/\%/.test(preValue)) {
                        preValue = preValue.replace(/\%/g, '');
                        preValue /= 100;
                      }

                      if (invert) {
                        preValue = -Math.abs(preValue);
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
                      [context.COSMETIC_ID]: result[i][context.COSMETIC_ID]
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
          result = arrayOfExpressionsIterator(arrayOfExpressions, rowData);
          arrayOfValues = arrayOfValues.concat(result);
          return arrayOfValues;
        } else {
          return arrayOfValues;
        }
      } catch (err) {
        return errorHandler({err: err, context: 'getArrayOfValues'});
      }
    };

    try {
      const leftOfExp = getColIdPair(newValue.slice(0, pos));
      const rightOfExp = getColIdPair(newValue.slice(pos + 1, newValue.length));

      const rowMax = Math.max(parseInt(leftOfExp.id), parseInt(rightOfExp.id));
      const rowMin = Math.min(parseInt(leftOfExp.id), parseInt(rightOfExp.id));

      const columns = getColumnRange(leftOfExp.col, rightOfExp.col);

      const arrayOfValues = getArrayOfValues(rowMin, rowMax, columns, rowData);

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
      return errorHandler({err: err, context: 'sumRange'});
    }
  };

  const resolveOrderOfOperations = (expression, rowData) => {
    let pos = expression.search(/[+\-]{1}/);
    let result;

    if (pos !== -1) {
      let left = expression.substring(0, pos);
      const op = expression[pos];
      let right = expression.substring(pos + 1);

      left = resolveOrderOfOperations(left, rowData);
      right = resolveOrderOfOperations(right, rowData);

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

        left = resolveOrderOfOperations(left, rowData);
        right = resolveOrderOfOperations(right, rowData);

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
          result = getValueOfColIdPair(colIdPair.col, colIdPair.id, rowData);
        } else {
          result = parseFloat(expression);
        }
      }
    }

    return result;
  };

  try {
    if (recursionCounter >= 500) throw 'Cell input is causing infinite recursion. Setting value to ERROR';

    let newValue;

    if (expression === undefined || expression === null || typeof expression !== 'string') throw `Expression isn't in right format. Likely getting an irregular value for expression.`;

    // search for expression symbol
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
          newValue = sumAllRanges(expression, posOfSumSplit, rowData);
          return String(newValue);
        } else {
          const posOfRangeSplit = expression.search(/:/);
          const hasRangeSplit = posOfRangeSplit !== -1;
          if (hasRangeSplit) {
            newValue = sumRange(expression, posOfRangeSplit, rowData);
            return String(newValue);
          } else {
            newValue = resolveOrderOfOperations(expression, rowData);
            return String(newValue);
          }
        }
      } else {
        newValue = resolveOrderOfOperations(expression, rowData);
        return String(newValue);
      }
    } else {
      newValue = expression;
      return String(newValue);
    }
  } catch (err) {
    errorHandler({err: err, context: 'resolveExpressionStatements', isLast: true});
    return 'ERROR';
  }
}

// updating

async function updateData(context, updateSets, index=0, needsRefresh = false) {
  try {
    if (updateSets[index].length > 10) {
      await loading(context, true, 'Updating a lot of data. Please wait...');
    }

    for (let i = 0; i < updateSets[index].length; i++) {
      if (updateSets[index][i].value === null) {
        updateSets[index][i].value = '';
      } else {
        if (updateSets[index][i].value === 'string') {
          updateSets[index][i].value = updateSets[index][i].value.replace(/'/, '\'\'');
        }
      }
    }

    const response = await context.sendRequest('api/ag-grid-spreadsheet/', 'updateData', updateSets[index]);

    if (updateSets[index + 1] !== undefined) {
      debugLog('calling updateData');

      await updateData(context, updateSets, index + 1);
    }

    if (needsRefresh) {
      await quickSnackbar('You may need to refresh the grid to see new expression results.');
    } else {
      if (!response.message) {
        if (updateSets[index].length > 10) {
          await loading(context, false);
        }
      }
    }
    return true;
  } catch (err) {
    return errorHandler({err: err, context: 'updateData'});
  }
}

async function updateStyle(context, updateSets, index=0) {
  try {
    await loading(context, true, 'Updating style. Please wait...');

    const response = await context.sendRequest('api/ag-grid-spreadsheet/', 'updateStyle', updateSets[index]);

    if (updateSets[index + 1] !== undefined) {
      debugLog('calling updateStyle');

      await updateStyle(context, updateSets, index + 1);
    }

    if (!response.message) {
      await loading(context, false);
    }

    return true;
  } catch (err) {
    return errorHandler({err: err, context: 'updateStyle'});
  }
}

// LOADING

async function loading(context, loading, msg, endSnackbarTime=2000) {
  try {
    if (loading) {
      startAgGridSpreadsheetClickBlocker(context);
      context.setLoading(true);
      context.loadingCellFocused = context.gridOptions.api.getFocusedCell();
      context.gridOptions.api.clearFocusedCell();
      document.activeElement.blur();
      if (msg) {
        await startSnackbar(msg);
      } else {
        await timeoutPromise(500);
      }
    } else {
      endAgGridSpreadsheetClickBlocker(context);
      if (context.loadingCellFocused && context.loadingCellFocused.column) {
        context.gridOptions.api.setFocusedCell(context.loadingCellFocused.rowIndex, context.loadingCellFocused.column.colId, context.loadingCellFocused.floating);
        context.loadingCellFocused = undefined; // reset this so nothing else can use this old value
      }
      context.setLoading(false);
      await endSnackbar(msg ? msg : 'Finished.', endSnackbarTime);
    }
  } catch (err) {
    return errorHandler({err: err, context: 'loading'});
  }
}

async function waitForLoadingFinish(context) {
  try {
    await waitForFinish(context, 'getLoading');
  } catch (err) {
    return errorHandler({err: err, context: 'waitForLoadingFinish'});
  }
}

async function startAgGridSpreadsheetClickBlocker(context) {
  try {
    await startClickBlocker(context.clickBlocker);
  } catch (err) {
    return errorHandler({err: err, context: 'startAgGridSpreadsheetClickBlocker'});
  }
}

async function endAgGridSpreadsheetClickBlocker(context) {
  try {
    await endClickBlocker(context.clickBlocker);
  } catch (err) {
    return errorHandler({err: err, context: 'endAgGridSpreadsheetClickBlocker'});
  }
}

/*
  FORMATTERS & COMPARATORS

  Used in grid-options-dynamic-config and value-formatter
  TODO: change this to option instead of hardcode
*/

/**
 * Comparator for currency
 *
 * @param {string} currency1
 * @param {string} currency2
 * @return {number}
 */
function currencyComparator(currency1, currency2) {
  if (currency1===null && currency2===null) return 0;
  if (currency1===null) return -1;
  if (currency2===null) return 1;

  const currency1Number = Number(currency1.replace(/[^0-9\.-]+/g, ''));
  const currency2Number = Number(currency2.replace(/[^0-9\.-]+/g, ''));

  return currency1Number - currency2Number;
}

/**
 * Comparator for numbers
 *
 * @param {string} numeric1
 * @param {string} numeric2
 * @return {number}
 */
function numericComparator(numeric1, numeric2) {
  if (numeric1===null && numeric2===null) return 0;
  if (numeric1===null) return -1;
  if (numeric2===null) return 1;

  const numeric1Number = parseInt(numeric1);
  const numeric2Number = parseInt(numeric2);

  return numeric1Number - numeric2Number;
}

/*
  SNACKBAR

  Requires element named 'saved-snackbar'
*/

/**
 * Shows snackbar with provided text.
 *
 * @param {string} text
 */
async function startSnackbar(text) {
  try {
    const savedSnackbar = document.getElementById('saved-snackbar');
    if (savedSnackbar) {
      savedSnackbar.innerHTML = text;
      savedSnackbar.classList.add('show');
    }

    // If there is no timeout here the snackbar doesn't get shown because
    // Ag-grid takes over the page to do its processing.
    await timeoutPromise(500);
  } catch (err) {
    return errorHandler({err: err, context: 'startSnackbar'});
  }
}

/**
 * Waits designated amount of time and then hides the snackbar.
 *
 * @param {element} savedSnackbar
 * @param {integer} time - ms
 */
async function snackbarWaiter(savedSnackbar, time) {
  try {
    await timeoutPromise(time);

    savedSnackbar.classList.add('hide');
    savedSnackbar.classList.remove('show');
  } catch (err) {
    return errorHandler({err: err, context: 'snackbarWaiter'});
  }
}

/**
 * Displays new text on snackbar, waits designated time, then hides snackbar.
 *
 * @param {string} text
 * @param {integer} time
 */
async function endSnackbar(text, time = 3000) {
  try {
    const savedSnackbar = document.getElementById('saved-snackbar');
    if (savedSnackbar) {
      savedSnackbar.innerHTML = text;
      await snackbarWaiter(savedSnackbar, time);
    }
  } catch (err) {
    return errorHandler({err: err, context: 'endSnackbar'});
  }
}

/**
 * Shows snackbar with text, waits designated time, then hides snackbar.
 *
 * @param {string} text
 * @param {integer} time
 */
async function quickSnackbar(text, time = 5000) {
  try {
    const savedSnackbar = document.getElementById('saved-snackbar');
    if (savedSnackbar) {
      savedSnackbar.innerHTML = text;
      savedSnackbar.classList.add('show');

      // If there is no timeout here the snackbar doesn't get shown because
      // Ag-grid takes over the page to do its processing.
      await timeoutPromise(500);

      snackbarWaiter(savedSnackbar, time);
    }
  } catch (err) {
    return errorHandler({err: err, context: 'quickSnackbar'});
  }
}

/**
 * Makes the snackbar take up essentially the entire screen.
 */
async function inflateSnackbar() {
  const savedSnackbar = document.getElementById('saved-snackbar');
  if (savedSnackbar) {
    savedSnackbar.classList.add('inflate');
  }
}

/**
 * Reverts the snackbar to it's original size after being inflated.
 */
function deflateSnackbar() {
  const savedSnackbar = document.getElementById('saved-snackbar');
  if (savedSnackbar) {
    savedSnackbar.classList.remove('inflate');
  }
}

/**
 * Given an error and a grid context, will provide snackbars, clickblockers, unfocusing, etc.
 * If there is a critical error, start the click blocker, clear the users selections in the grid
 * provided in context, blur any element focuses, and inflate the snackbar.
 * If error is not critical, just show the error message.
 *
 * @param {object} err - Javascript Error
 * @param {object} context - Ag-Grid context.
 */
async function errorSnackbarHandler(err, context) {
  console.log(err);
  if (err[0]) {
    if (err[0].critical) {
      await startClickBlocker();

      if (context.gridOptions && context.gridOptions.api) {
        context.loadingCellFocused = context.gridOptions.api.getFocusedCell();
        context.gridOptions.api.clearFocusedCell();
      }
      document.activeElement.blur();

      await inflateSnackbar();
      if (err[0].msg) await startSnackbar(err[0].msg);
    } else {
      if (err[0].msg) await quickSnackbar(err[0].msg, 10000);
    }
  } else {
    return false;
  }
}

/*
  CLICK BLOCKER

  requires element for use as a click blocker
*/

/**
 * Shows click blocker.
 *
 * @param {string} elementName
 */
async function startClickBlocker(elementName = 'click-blocker') {
  try {
    const clickBlocker = document.getElementById(elementName);

    if (clickBlocker) clickBlocker.className = 'show';
  } catch (err) {
    return errorHandler({err: err, context: 'startClickBlocker'});
  }
}

/**
 * Hides click blocker.
 *
 * @param {string} elementName
 */
async function endClickBlocker(elementName = 'click-blocker') {
  try {
    const clickBlocker = document.getElementById(elementName);

    if (clickBlocker) clickBlocker.className = 'hide';
  } catch (err) {
    return errorHandler({err: err, context: 'endClickBlocker'});
  }
}

// utility
/**
 * Calls the function or class function until it returns true, every pollTime.
 *
 * @param {function|class} funcOrClass - either a function or a class (with cooresponding funcName) to check.
 * @param {string} funcName - class function name. only relevant if funcOrClass is a class
 * @param {number} pollTime - time in betweeen calls
 * @return {promise} - resolves when func returns affirmative response.
 */
function waitForFinish(funcOrClass, funcName, pollTime = 400) {
  let poll;

  if (typeof funcOrClass === 'function') {
    poll = (resolve) => {
      if (!funcOrClass()) resolve();
      else setTimeout(() => poll(resolve), pollTime);
    };
  } else {
    poll = (resolve) => {
      if (!funcOrClass[funcName](funcOrClass)) resolve();
      else setTimeout(() => poll(resolve), pollTime);
    };
  }

  return new Promise(poll);
}

/**
 * Collects error information as the error propogates through functions
 * with the intention of giving a simple stack trace.
 *
 * @param {object} errObj - Obj containing the following information:
 *        {object} err - the error parameter from the catch block
 *        {string} context - name of the function that this call is coming from
 *        {boolean} isLast - whether or not this is the last function in the chain
 *        {boolean} reject - whether or not the error being thrown is coming from a promise rejection
 * @return {string or array} - returns a string or array of strings depending on if it's a promise rejection.
*/

function errorHandler(errObj) {
  /*
    If this is the first time handled (err is string) then make it array
    for the rest of the journey.

    Each time err is handled the context of that catch block is added.

    If the err has reached it's final destination (third parameter is true)
    then send as concat string.

    if the err is from a promise (is needed for a reject) (fourth parameter)
    then just return the array of err so it can be rejected and will continue
    the journey outside.
  */

  const err = errObj.err;
  const context = errObj.context;
  const isLast = errObj.isLast;
  const reject = errObj.reject;

  let errArr = [];

  if (typeof err === 'string') {
    errArr.push(err); // case where string is explicitly thrown
  } else if (err[0] !== undefined) {
    errArr = err; // case where it's the array we're passing foward
  } else {
    errArr.push(err); // case where a inexplicit error is thrown
  }

  errArr.push('=> ' + context);

  if (isLast) {
    let output = '';

    for (const i in errArr) {
      if (typeof errArr[i] === 'object') { // if item is err obj
        if (errArr[i].stack !== undefined) { // if err obj has .stack property (edge doesn't)
          output += errArr[i].stack + '\n';
        } else if (errArr[i].message !== undefined) { // if is err obj
          output += errArr[i].message + '\n';
        } else { // if is fetch response obj or other unidentified obj
          for (const j in errArr[i]) {
            output += j + ': ' + errArr[i][j] + '\n';
          }
        }
      } else { // if item is string
        output += errArr[i] + '\n';
      }
    }

    console.log(output);
    return output;
  } else {
    if (!reject) {
      throw errArr;
    } else {
      return errArr;
    }
  }
}

/**
 * Provides a console.log interface that only prints when debugging is true.
 *
 * @param {string} string - text to log
 */
function debugLog(string) {
  const DEBUG = false;

  if (DEBUG) {
    console.log(string);
  }
}

/**
 * Promise function that waits a designated amount of milliseconds
 *
 * @param {number} ms
 * @return {boolean} - true on resolution.
 */
function timeoutPromise(ms) {
  return new Promise((resolve, reject) => {
    try {
      setTimeout(() => {
        return resolve(true);
      }, ms);
    } catch (err) {
      console.log(err);
      reject(err);
    }
  });
}

/**
 * Function used to process each cell during an excel export with Ag-Grid.
 *
 * @param {object} params
 * @return {number|string}
 */
function excelExportProcessCellFunc(params) {
  try {
    const context = params.context;
    const columnTable = context.getColumnTable();

    const rowData = getRowData(context.gridOptions);

    if (!context.COSMETIC_ID) {
      context.COSMETIC_ID = 'grid_specific_id';
    }

    if (!context.ID) {
      context.ID = 'id';
    }

    params.data = params.node.data;

    let newValue = '';

    const dataExists = params.data !== undefined && params.data[params.column.colId] !== null;
    if (dataExists) {
      const cellValue = String(params.data[params.column.colId]);
      const isExpression = /^=/.test(cellValue);
      if (isExpression) {
        newValue = resolveExpressionStatements(cellValue, context, rowData, columnTable);
      } else {
        const column = columnTable.find((column) => column.column_name === params.column.colId);
        if (!column) throw `Couldn't find column.`;


        if (column.horizontal_formula) {
          const formula = column.horizontal_formula.replace(/{i}/g, params.data[context.COSMETIC_ID]);
          newValue = resolveExpressionStatements(formula, context, rowData, columnTable);
        } else {
          newValue = params.value;
        }
      }
    }

    return newValue;
  } catch (err) {
    return errorHandler({err: err, context: 'excelExportProcessCellFunc', isLast: true});
  }
};

/**
 * Finds an object in an array of objects
 *
 * @param {object} obj - obj to find in arr
 * @param {object} arr - arr to find obj in
 * @return {number} - index where obj was found in arr
 */
function findIndexOfObjInArr(obj, arr) {
  let index = -1;

  for (let i = 0; i < arr.length; i++) {
    if (arr[i] !== undefined) {
      if (isEquivalent(obj, arr[i])) {
        index = i;
        break;
      }
    } else {
      console.log('undefined skipping');
    }
  }

  if (index === -1) {
    console.log(`didn't find matching object`);
  }

  return index;
}

/**
 * Checks if the two given objects are the same, namely having the exact same
 * properties with the exact same values in each.
 *
 * @param {object} a
 * @param {object} b
 * @return {boolean}
 */
function isEquivalent(a, b) {
  const aProps = Object.getOwnPropertyNames(a);
  const bProps = Object.getOwnPropertyNames(b);

  if (aProps.length != bProps.length) {
    return false;
  }

  for (let i = 0; i < aProps.length; i++) {
    const propName = aProps[i];
    if (a[propName] !== b[propName]) {
      if (typeof a[propName] === 'object' && a[propName].length === undefined &&
          typeof b[propName] === 'object' && b[propName].length === undefined &&
          isEquivalent(a[propName], b[propName])) {

      } else if (typeof a[propName] === 'object' && a[propName].length !== undefined &&
                 typeof b[propName] === 'object' && b[propName].length !== undefined &&
                 arraysEqual(a[propName], b[propName])) {

      } else {
        return false;
      }
    }
  }

  return true;
}

/**
 * This function solves Javascript's float misrepresentation
 *
 * @param {number} n float to fix
 * @return {number} float without float misrepresentation
*/
function fixFloatError(n) {
  return Math.round(n * 1000000000) / 1000000000;
}

/**
 * This function rounds floats while accounting for float misrepresentation
 *
 * @param {number} n float to round
 * @param {number} i integer rounding place
 * @return {number} float rounded
*/
function roundFloat(n, i=0) {
  i = i === 0 ? 1 : (Math.pow(10, i));
  let r = n * i;
  r = fixFloatError(r);
  r = Math.round(r);
  r = r / i;
  r = fixFloatError(r);
  return r;
}

/**
 * This function rounds floats while accounting for float misrepresentation
 * and also converts it to a string with the specified number of digits after the decimal.
 *
 * @param {number} n float to round
 * @param {number} i integer rounding place
 * @return {string} float rounded and given specified number of digits after the decimal.
*/
function fixedToFixed(n, i) {
  n = String(roundFloat(n, i));

  const decimalLocation = n.search(/\./);

  if (i > 0) {
    if (decimalLocation !== -1) {
      while (n.match(/\.(\d*)/)[1].length !== i) {
        n += '0';
      }
    } else {
      n += '.';
      for (let j = 0; j < i; j++) {
        n += '0';
      }
    }
  }

  return n;
}

/**
 * Takes in a string and makes sure it looks like a number.
 *
 * @param {string} val
 * @return {boolean}
 */
function isNumber(val) {
  return val !== '' && /^-?\d*\.?\d*$/.test(val);
};

/**
 * Find an object in an array of objects given a key and a value to match.
 * (this can more easily be accomplished by using arr.find() and/or arr.findIndex())
 *
 * @param {object} table - array of objects to check
 * @param {string} objKeyToCheck - key in obj to find
 * @param {string|number|boolean} valueToCheckAgainst value in obj to find
 * @return {object} - obj consisting of the found 'obj' and it's 'index'.
 */
function findObjInArrOfObjViaOneKeyValChk(table, objKeyToCheck, valueToCheckAgainst) {
  for (let i = 0; i < table.length; i++) {
    if (table[i][objKeyToCheck] === valueToCheckAgainst) {
      return {obj: table[i], index: i};
    }
  }

  return {obj: {}, index: -1};
}

/**
 * Converts string to title case
 * ex. i am a string => I Am A String
 *
 * @param {string} str
 * @return {string}
 */
function toTitleCase(str) {
  return str.replace(/\w\S*/g, (txt) => {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

export {
  getRowData,
  getRowDataAfterFilterAndSort,
  getRowDataAfterFilterAndSortAndRemoveUndefined,
  getRowNodeFromTextNode,
  copyStringToClipboard,
  isSingleCellSelection,
  changeFormulaBar,
  moveSelection,
  getDBRowData,
  verifyDataTable,
  getDBColumnTable,
  verifyColumnTable,
  verifyStyleTable,
  getDataTablesSchema,
  extractStyles,
  resolveFormattingExpressions,
  resolveExpressionStatements,
  updateData,
  updateStyle,
  loading,
  waitForLoadingFinish,
  startAgGridSpreadsheetClickBlocker,
  endAgGridSpreadsheetClickBlocker,
  currencyComparator,
  numericComparator,
  startSnackbar,
  snackbarWaiter,
  endSnackbar,
  quickSnackbar,
  inflateSnackbar,
  deflateSnackbar,
  errorSnackbarHandler,
  startClickBlocker,
  endClickBlocker,
  waitForFinish,
  errorHandler,
  debugLog,
  timeoutPromise,
  excelExportProcessCellFunc,
  findIndexOfObjInArr,
  isEquivalent,
  fixFloatError,
  roundFloat,
  fixedToFixed,
  isNumber,
  findObjInArrOfObjViaOneKeyValChk,
  toTitleCase
};