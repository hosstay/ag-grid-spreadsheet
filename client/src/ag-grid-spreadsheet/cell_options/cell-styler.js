import {extractStyles} from '../utility/utility';

export function cellStyler(params) {
  const isColumnWithStyle = (styleColumn) => {
    /*
      context.COSMETIC_ID, context.ID, and ag_Grid-AutoColumn (grouping) don't
      have 'styleattrib_' columns in the style table.
    */

    const nonStyleattribColumns = [
      `styleattrib_${context.COSMETIC_ID}`,
      `styleattrib_${context.ID}`,
      `styleattrib_ag-Grid-AutoColumn`
    ];

    return !nonStyleattribColumns.includes(styleColumn);
  };

  const context = params.context;
  const styleColumn = 'styleattrib_' + params.column.colId;

  let cellStyle;

  if (params.node.id !== undefined && isColumnWithStyle(styleColumn)) {
    cellStyle = params.data[styleColumn];
  } else {
    cellStyle = '';
  }

  let bgColor = '#FFFFFF';
  let ftColor = '#000000';
  let border = 'transparent';
  let fontWeight = 'normal';

  let pos = -1;

  /* background color / font color */
  if (cellStyle !== undefined && cellStyle !== null) {
    pos = cellStyle.search(/#[\w]+bg/); // background color styles are of form '#111111bg' using HEX
    if (pos != -1) {
      bgColor = cellStyle.slice(pos, pos + 7);
      pos = -1;
    }

    pos = cellStyle.search(/#[\w]+ft/); // font color styles are of form '#111111ft' using HEX
    if (pos != -1) {
      ftColor = cellStyle.slice(pos, pos + 7);
      pos = -1;
    }

    /* all other styles */
    const styles = extractStyles(cellStyle);

    for (let i = 0; i < styles.length; i++) {
      let format = styles[i];
      // let formatParams;

      // find format and format params within style.
      pos = -1;
      pos = styles[i].search(/\|/);
      if (pos !== -1) {
        format = styles[i].slice(0, pos);
        // formatParams = styles[i].slice(pos + 1, styles[i].length);
      }

      if (format === 'bdr') {
        border = 'black';
      }

      if (format === 'bld') {
        fontWeight = 'bold';
      }
    }
  }

  let style;

  if (border === 'black') {
    style = {
      backgroundColor: bgColor,
      color: ftColor,
      borderColor: border,
      fontWeight: fontWeight,
      borderTopWidth: '0.5px',
      borderBottomWidth: '0.5px',
      borderLeftWidth: '0.5px',
      borderRightWidth: '0.5px'
    };
  } else {
    style = {
      backgroundColor: bgColor,
      color: ftColor,
      fontWeight: fontWeight,
      borderColor: '#F0F0F0',
      borderTopWidth: '0',
      borderBottomWidth: '0',
      borderLeftWidth: '0.5px',
      borderRightWidth: '0.5px'
    };
  }

  return style;
}