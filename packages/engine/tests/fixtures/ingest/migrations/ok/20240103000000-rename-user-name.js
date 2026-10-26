'use strict';
module.exports = {
  up: (queryInterface, Sequelize) => queryInterface.renameColumn('users', 'name', 'full_name'),
  down: (queryInterface, Sequelize) => queryInterface.renameColumn('users', 'full_name', 'name'),
};
