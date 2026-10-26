'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('users', [{ name: 'x' }]);
    await queryInterface.changeColumn('users', 'email', { type: Sequelize.TEXT });
    await queryInterface.addColumn('users', 'nickname', { type: Sequelize.STRING });
  },
};
