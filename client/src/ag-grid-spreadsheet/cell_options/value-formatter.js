import {resolveExpressionStatements,
  resolveFormattingExpressions,
  getRowData,
  pennyCurrencyFormatter,
  currencyFormatter,
  integerRoundingNumericFormatter,
  maintainDatatypeNumericFormatter,
  numericFormatter,
  dateFormatter,
  slashDateMMDDYYYYFormatter,
  errorHandler,
  isNumber,
  fixFloatError,
  roundFloat,
  fixedToFixed,
  findObjInArrOfObjViaOneKeyValChk} from '../utility/utility';
import {toCurrencyFormat} from '../actions/grid-functions';

export function valueFormatter(params) {
  try {
    const context = params.context;
    const columnTable = context.getColumnTable();

    let column;
    let newValue = 'Refresh grid to see value';

    const dataExists = params.data !== undefined && params.data[params.column.colId] !== null;
    if (dataExists) {
      const cellValue = String(params.data[params.column.colId]);

      const isExpression = /^=/.test(cellValue);
      if (isExpression) {
        const gridSpecificId = params.data[context.COSMETIC_ID];
        const rowData = getRowData(context.gridOptions);
        column = columnTable.find((column) => column.column_name === params.column.colId);
        if (!column) throw `Couldn't find column.`;

        for (let i = 0; i < rowData.length; i = i + 200) {
          if (rowData[i] !== undefined) {
            const expValue = rowData[i]['expvalue_' + params.column.colId + '_' + gridSpecificId];

            if (expValue !== undefined) {
              newValue = column.to_currency ? toCurrencyFormat(expValue) : expValue;
              break;
            }
          }
        }
      } else if (cellValue === '' ||
                 cellValue === null ||
                (params.column.colId === 'com_amt') && params.node.childrenCache) {
        column = columnTable.find((column) => column.column_name === params.column.colId);
        if (!column) throw `Couldn't find column.`;

        const hasHorizontalFormula = column.horizontal_formula !== undefined && column.horizontal_formula !== null;
        if (hasHorizontalFormula) {
          const rowData = getRowData(context.gridOptions);

          // horizontal formulas rely on mgrid cosmetic id for referencing cells, so it needs to have it.
          if (params.data[context.COSMETIC_ID]) {
            const formula = column.horizontal_formula.replace(/{i}/g, params.data[context.COSMETIC_ID]);
            newValue = String(resolveExpressionStatements(formula, context, rowData, columnTable));

            if (newValue !== '') {
              newValue = fixFloatError(newValue);
            }

            newValue = String(newValue);
          } else {
            // Grouping Specific
            const recordIndex = params.node.rowIndex;
            newValue = 0;
            let rowsSummed = 0;

            for (let j = recordIndex + 1; j < rowData.length; j++) {
              const row = context.gridOptions.api.getDisplayedRowAtIndex(j);

              if (row.data) {
                const isGroupingRow = row.data[context.COSMETIC_ID] === undefined;
                if (isGroupingRow) {
                  break;
                }

                rowsSummed++;

                const formula = column.horizontal_formula.replace(/{i}/g, row.data[context.COSMETIC_ID]);

                let sumToAdd;

                if (params.column.colId === 'com_amt') {
                  if (/^$/.test(row.data.count) && /^$/.test(row.data.premium)) {
                    if (isNumber(row.data.com_amt)) {
                      sumToAdd = row.data.com_amt;
                    } else {
                      sumToAdd = '0.00';
                    }
                  } else if (/^[a-zA-Z]+$/.test(row.data.count) || /^[a-zA-Z]+$/.test(row.data.premium)) {
                    sumToAdd = '0.00';
                  } else {
                    if (/^$/.test(row.data.com_amt)) {
                      sumToAdd = String(resolveExpressionStatements(formula, context, rowData, columnTable));
                    } else {
                      sumToAdd = row.data.com_amt;
                    }
                  }
                } else {
                  sumToAdd = '0.00';
                }

                sumToAdd = fixFloatError(sumToAdd);
                sumToAdd = roundFloat(sumToAdd, 2);

                newValue += sumToAdd;
                newValue = fixFloatError(String(newValue));

                if (!newValue) newValue = 0;
              }
            }

            newValue = fixedToFixed(newValue, 2);
            /*
              This formatter runs multiple times and overwrites the legitimate
              sums with bunk data in between runs as it attempts to load the
              new data in. One of the bunk data runs is it loading in the
              first row and nothing else of the new data set for some reason.
              So i've cut it from updating the monthlyAgg obj.
            */
            if (rowsSummed > 1) {
              context.pushAgg({
                firm: params.data.firm,
                year: params.data.year,
                month: params.data.month,
                aggValue: parseFloat(newValue)
              }, 'month');
            }

            if (!newValue) newValue = '0';
          }
        } else {
          newValue = '';
        }
      } else {
        newValue = params.data[params.column.colId];
      }

      column = column ? column : findObjInArrOfObjViaOneKeyValChk(columnTable, 'column_name', params.column.colId).obj;

      if (!column) {
        column = columnTable.find((column) => {
          return column.column_name === params.column.colId;
        });
        if (!column) throw `Couldn't find column.`;
      }

      newValue = resolveFormattingExpressions(newValue, params);
    } else {
      newValue = '';
    }

    return newValue;
  } catch (err) {
    errorHandler({err: err, context: 'valueFormatter', isLast: true});
    return 'ERROR';
  }
}