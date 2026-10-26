'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'age', { type: Sequelize.INTEGER, allowNull: true });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('users', 'age');
  },
};
