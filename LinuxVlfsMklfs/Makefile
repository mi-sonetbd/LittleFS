my_c := $(wildcard *.c)
my_o = $(my_c:.c=.o)


main : $(my_o)
	$(CC) $(LDFLAGS) $(my_o) -o main

main.o : main.c
	$(CC) $(CFLAGS) -c $(my_c)

clean :
	rm *.o main