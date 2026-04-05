import { DataSource } from "typeorm";

const AppDataSource = new DataSource({
    type: "sqlite",
    database: "draughts_db.sqlite",
    entities: [__dirname + '/src/**/*.entity{.ts,.js}'],
    synchronize: true,
});

AppDataSource.initialize().then(async () => {
    await AppDataSource.query(`INSERT INTO game_history (winner, moves, "createdAt") VALUES ('L', '[{"from":{"row":5,"col":0},"to":{"row":4,"col":1}},{"from":{"row":2,"col":1},"to":{"row":3,"col":0}},{"from":{"row":5,"col":2},"to":{"row":4,"col":3}}]', datetime('now'))`);
    console.log("Seeded history");
}).catch(error => console.log(error));
