import {changeFormulaBar,
  getRowData,
  resolveExpressionStatements} from '../utility/utility';

export function processCellForClipboard(params) {
  const context = params.context;
  const columnTable = context.getColumnTable();
  const colId = params.column.colId;
  const nodeId = params.node.id;
  const cosmeticId = params.node.data[context.COSMETIC_ID];

  let value = params.value;

  if (params.value === '' ||
      params.value === null ||
      (params.column.colId === 'com_amt') && params.node.childrenCache) {
    const column = columnTable.find((column) => column.column_name === colId);

    if (column.horizontal_formula) {
      const rowData = getRowData(context.gridOptions);

      if (cosmeticId) {
        const formula = column.horizontal_formula.replace(/{i}/g, cosmeticId);

        value = resolveExpressionStatements(formula, context, rowData, columnTable);
      } else {
        const row = params.node.data;

        if (row.year === undefined) {
          const recordIndex = params.node.rowIndex;
          value = 0;

          for (let j = recordIndex + 1; j < rowData.length; j++) {
            const currRow = context.gridOptions.api.getDisplayedRowAtIndex(j);
            if (currRow === null || currRow.data[context.COSMETIC_ID] === undefined) {
              break;
            }

            const formula = column.horizontal_formula.replace(/{i}/g, currRow.data[context.COSMETIC_ID]);

            value += parseFloat(resolveExpressionStatements(formula, context, rowData, columnTable));
          }

          value = String(value);
        }
      }
    }
  }

  context.setCopyInformation(colId, nodeId, cosmeticId);

  return value;
}

export function processCellFromClipboard(params) {
  let newValue = params.value.trim();

  // take out all commas from copy. The grid saves data as
  // straight numbers and then adds the commas when it shows them.
  if (!isNaN(newValue.replace(/,/g, ''))) {
    newValue = newValue.replace(/,/g, '');
  }

  // increment if formula
  const copyParams = params.context.getCopyInformation();
  if (!copyParams || newValue === null || !/^=/.test(newValue)) return newValue;

  let incrementBy = Math.max(copyParams.copyCosmeticId, params.node.data[params.context.COSMETIC_ID]) -
                    Math.min(copyParams.copyCosmeticId, params.node.data[params.context.COSMETIC_ID]);
  if (copyParams.copyCosmeticId > params.node.data[params.context.COSMETIC_ID]) {
    incrementBy *= -1;
  }

  console.log('originalValue: ' + newValue);
  console.log('incrementBy: ' + incrementBy);

  newValue = incrementData(newValue, params, copyParams, incrementBy);
  console.log('newValue: ' + newValue);

  changeFormulaBar(params.context, newValue);

  return newValue;
}

const incrementData = (str, params, copyParams, incrementBy) => {
  const column = params.column.colId;

  const strParts = [];
  let pos = -1;

  // change column
  const re = new RegExp(copyParams.copyColumn, 'g');
  str = str.replace(re, column);

  // change rows
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
    if (/\d/.test(strParts[i])) {
      if (/[a-zA-Z_]/.test(strParts[i - 1])) {
        newString += String(parseInt(strParts[i]) + incrementBy);
      } else {
        newString += strParts[i];
      }
    } else {
      newString += strParts[i];
    }
  }

  return newString;
};