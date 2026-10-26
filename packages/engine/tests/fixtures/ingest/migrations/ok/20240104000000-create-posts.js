'use strict';
module.exports = {
  up: function (queryInterface, DataTypes) {
    return queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.createTable(
        { tableName: 'posts', schema: 'public' },
        {
          id: { type: DataTypes.UUID, primaryKey: true },
          user_id: { type: DataTypes.INTEGER, references: { model: 'users', key: 'id' } },
          body: { type: DataTypes.TEXT },
        },
        { transaction: t },
      );
    });
  },
  down: function (queryInterface) {
    return queryInterface.dropTable('posts');
  },
};
