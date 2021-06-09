/*
  This example uses express, but the backend framework doesn't matter.
*/

// const bodyParser = require('body-parser');
const express = require('express');
// const jwt = require('express-jwt');
// const config = require('../config');
// const compression = require('compression');

const app = module.exports = express.Router();

// app.use(bodyParser.json()); // parses any json we're sent
// app.use(bodyParser.urlencoded({extended: true})); // this allows us to send data via Postman

// const jwtCheck = jwt({
//   secret: config.secret
// });

const endpointPrefix = '/api/ag-grid-spreadsheet';

// app.use(endpointPrefix, jwtCheck); // authenticate user that we're sending data to.
// app.use(compression()); // compresses for faster transfer

// model for interacting with db
const model = require('../models/ag-grid-spreadsheet');

// general functions
app.post(endpointPrefix + '/getRows', model.getRows);
app.post(endpointPrefix + '/getRawRows', model.getRawRows);
app.post(endpointPrefix + '/verifyDataTable', model.verifyDataTable);
app.post(endpointPrefix + '/verifyStyleTable', model.verifyStyleTable);
app.post(endpointPrefix + '/verifyColumnTable', model.verifyColumnTable);
app.post(endpointPrefix + '/getColumns', model.getColumns);
app.post(endpointPrefix + '/getDataTablesSchema', model.getDataTablesSchema);

// saving functions
app.post(endpointPrefix + '/updateData', model.updateData);
app.post(endpointPrefix + '/updateStyle', model.updateStyle);
app.post(endpointPrefix + '/addRow', model.addRow);
app.post(endpointPrefix + '/removeRow', model.removeRow);
app.post(endpointPrefix + '/addColumn', model.addColumn);
app.post(endpointPrefix + '/removeColumn', model.removeColumn);
app.post(endpointPrefix + '/renameColumn', model.renameColumn);
app.post(endpointPrefix + '/setCustomHeaderName', model.setCustomHeaderName);
app.post(endpointPrefix + '/hideColumn', model.hideColumn);
app.post(endpointPrefix + '/pinColumn', model.pinColumn);
app.post(endpointPrefix + '/forceProperty', model.forceProperty);
app.post(endpointPrefix + '/setColumnWidth', model.setColumnWidth);
app.post(endpointPrefix + '/setHorizontalFormula', model.setHorizontalFormula);
app.post(endpointPrefix + '/copyFormulaDownColumn', model.copyFormulaDownColumn);
app.post(endpointPrefix + '/setColumnData', model.setColumnData);
app.post(endpointPrefix + '/appendAgGridSpreadsheetRecord', model.appendAgGridSpreadsheetRecord);
app.post(endpointPrefix + '/addRowWithData', model.addRowWithData);
app.post(endpointPrefix + '/addRowWithPartiallyCopiedData', model.addRowWithPartiallyCopiedData);